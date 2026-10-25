import { z } from 'zod';
import type {
  DocSyncFinding,
  DocSyncIssue,
  DocSyncRepo,
  DocSyncRepoUpdate,
  DocSyncRun,
  DocSyncSchedule,
  DocSyncScheduleUpdate,
  LLMProvider,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ConflictError, NotFoundError, AppError } from '../../platform/errors.js';
import { withTimeout } from '../../platform/resilience.js';
import { docSyncNotification, summarizeError } from '../notifications/helpers.js';
import { filterAllowedPaths } from '../project-context/helpers.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  CHECK_REPO_JOB_KIND,
  CHECK_REPO_TIMEOUT_MS,
  COMMIT_MESSAGE,
  DOCS_BRANCH,
  JUDGE_MIN_CONFIDENCE,
  LLM_CALL_TIMEOUT_MS,
  MAX_CHANGED_FILES_LISTED,
  MAX_CHANGED_LINES_PER_DOC,
  MAX_CODE_EXCERPTS_PER_DOC,
  MAX_CODE_EXCERPT_CHARS,
  MAX_DIAGRAM_LINES,
  MAX_DIAGRAM_NODES,
  MAX_DOC_CHARS_FOR_LLM,
  MAX_LLM_DOCS_PER_REPO,
  MAX_STORED_FINDINGS,
  PR_TITLE,
  RUNS_LIMIT,
  TICK_MS,
} from './constants.js';
import {
  applyEdits,
  buildPathIndex,
  buildPrBody,
  changedLineCount,
  checkDoc,
  computeNextRunAt,
  decideTick,
  diagramProblem,
  docRelatesTo,
  findingPathForms,
  isDocPath,
  newFindings,
  nextOccurrence,
  pathCandidates,
  splitRawDiff,
  touchesDiagram,
  type CheckContext,
  type PrDocSummary,
} from './helpers.js';
import {
  EDITOR_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
  buildEditorMessage,
  buildJudgeMessage,
  type PromptEvidence,
} from './prompts.js';
import { DocSyncRepository, type RepoRow, type ResultRow, type RunRow, type ScheduleRow } from './repository.js';

interface CheckRepoPayload {
  runId: string;
  repoId: string;
  workspaceId: string;
  /** Manual runs re-check a repo even when its HEAD hasn't moved. */
  force: boolean;
}

const JudgeResponse = z.object({
  issues: z.array(
    z.object({
      claim: z.string(),
      problem: z.string(),
      evidence: z.string(),
      confidence: z.number(),
    }),
  ),
});

const EditorResponse = z.object({
  edits: z.array(z.object({ find: z.string(), replace: z.string() })),
});

interface ScanResult {
  /** Doc path → content, for every documentation file. */
  docs: Map<string, string>;
  findings: DocSyncFinding[];
  ctx: CheckContext;
}

interface ChangedFiles {
  files: string[];
  /** Per-file `git diff` chunk, keyed by path. */
  diffs: Map<string, string>;
}

interface ReviewOutcome {
  /** Docs whose edits passed validation, with their new full content. */
  files: { path: string; contents: string }[];
  issues: DocSyncIssue[];
  summaries: PrDocSummary[];
  costUsd: number;
}

type PrOutcome = Pick<ResultRow, 'prUrl' | 'prAction' | 'prError'>;

/**
 * Docs Sync (server/specs/doc-sync.md): schedule + ticker, runs, the
 * deterministic doc checks, the LLM judge/editor and the draft docs PR. One
 * instance per app (routes.ts), which also owns the ticker's lifecycle.
 */
export class DocSyncService {
  private repo: DocSyncRepository;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private container: Container) {
    this.repo = new DocSyncRepository(container.db);
  }

  // ---- schedule ---------------------------------------------------------

  async getSchedule(workspaceId: string): Promise<DocSyncSchedule> {
    return toScheduleDto(await this.repo.getOrCreateSchedule(workspaceId));
  }

  async updateSchedule(workspaceId: string, input: DocSyncScheduleUpdate): Promise<DocSyncSchedule> {
    const nextRunOverride = input.next_run_override ? new Date(input.next_run_override) : null;
    const rule = { ...input, nextRunOverride };
    const row = await this.repo.updateSchedule(workspaceId, {
      enabled: input.enabled,
      time: input.time,
      days: [...new Set(input.days)].sort(),
      repeat: input.repeat,
      timezone: input.timezone,
      nextRunOverride,
      nextRunAt: computeNextRunAt(rule, new Date()),
    });
    return toScheduleDto(row);
  }

  // ---- repos ------------------------------------------------------------

  async listRepos(workspaceId: string): Promise<DocSyncRepo[]> {
    return (await this.repo.listRepos(workspaceId)).map(toRepoDto);
  }

  async updateRepo(workspaceId: string, repoId: string, input: DocSyncRepoUpdate): Promise<DocSyncRepo> {
    const row = await this.repo.updateRepo(workspaceId, repoId, {
      ...(input.enabled !== undefined ? { docSyncEnabled: input.enabled } : {}),
      ...(input.clear_dismissed ? { docSyncDismissed: [] } : {}),
    });
    if (!row) throw new NotFoundError('Repo not found');
    return toRepoDto(row);
  }

  // ---- runs -------------------------------------------------------------

  /** Start a run over every opted-in cloned repo (AC-5, AC-6). */
  async startRun(workspaceId: string, trigger: RunRow['trigger']): Promise<DocSyncRun> {
    if (await this.repo.runningRun(workspaceId)) {
      throw new ConflictError('A docs check is already running', undefined, 'doc_sync_in_progress');
    }
    const repos = (await this.repo.listRepos(workspaceId)).filter((r) => r.docSyncEnabled && r.clonePath);
    if (repos.length === 0) {
      throw new AppError('no_repos', 'No repository is enabled for docs checks', 422);
    }
    const run = await this.repo.createRun(
      workspaceId,
      trigger,
      repos.map((r) => r.id),
    );
    await this.repo.updateSchedule(workspaceId, { lastRunAt: run.startedAt });
    for (const r of repos) {
      const payload: CheckRepoPayload = { runId: run.id, repoId: r.id, workspaceId, force: trigger === 'manual' };
      try {
        await this.container.jobs.enqueue(workspaceId, CHECK_REPO_JOB_KIND, payload);
      } catch (err) {
        await this.repo.saveResult(run.id, r.id, { status: 'failed', error: summarizeError((err as Error).message) });
        await this.finishIfComplete(run.id);
      }
    }
    return (await this.getRun(workspaceId, run.id))!;
  }

  async listRuns(workspaceId: string): Promise<DocSyncRun[]> {
    const runs = await this.repo.listRuns(workspaceId, RUNS_LIMIT);
    const results = await this.repo.resultsFor(runs.map((r) => r.id));
    return runs.map((run) => toRunDto(run, results.filter((r) => r.runId === run.id)));
  }

  private async getRun(workspaceId: string, runId: string): Promise<DocSyncRun | null> {
    const run = await this.repo.getRun(workspaceId, runId);
    if (!run) return null;
    return toRunDto(run, await this.repo.resultsFor([run.id]));
  }

  registerJobHandler(): void {
    // No retries: the handler never throws, and a retry would pay for the LLM twice.
    this.container.jobs.register(
      CHECK_REPO_JOB_KIND,
      (payload) => this.checkRepo(payload as CheckRepoPayload),
      undefined,
      { timeoutMs: CHECK_REPO_TIMEOUT_MS, retries: 0 },
    );
  }

  /** The job body. Never throws — a throw would make JobRunner retry the repo. */
  private async checkRepo({ runId, repoId, workspaceId, force }: CheckRepoPayload): Promise<void> {
    try {
      const repo = await this.repo.getRepo(repoId);
      if (!repo?.clonePath) throw new Error('Repository is not cloned');
      const prevSha = repo.docSyncLastSha;
      const { sha, synced } = await this.syncClone(repo);

      // Nothing moved since the last check: skip everything, cost $0.
      if (!force && prevSha === sha) {
        await this.repo.saveResult(runId, repoId, { status: 'unchanged', checkedSha: sha });
        await this.repo.markRepoChecked(repoId, sha);
        return;
      }

      const scan = await this.scan(repo);
      const changed: ChangedFiles =
        prevSha && prevSha !== sha ? await this.changedFiles(repo, prevSha, sha) : { files: [], diffs: new Map() };
      const dismissed = await this.refreshDismissed(repo);
      const review = await this.review(workspaceId, scan, changed, dismissed).catch((err: Error) => err);

      let pr: PrOutcome = { prUrl: null, prAction: 'none', prError: null };
      if (review instanceof Error) {
        pr = { prUrl: null, prAction: 'failed', prError: summarizeError(review.message) };
      } else if (review.files.length > 0) {
        pr = synced
          ? await this.publishPr(repo, sha, review, remainingFindings(scan.findings, review.files))
          : { prUrl: null, prAction: 'failed', prError: 'Uncommitted doc edits in the clone (Project Context) — PR skipped' };
      }

      const reviewed = review instanceof Error ? null : review;
      const issues = reviewed?.issues ?? [];
      await this.repo.saveResult(runId, repoId, {
        status: scan.findings.length > 0 || issues.length > 0 ? 'stale' : 'up_to_date',
        checkedSha: sha,
        docsScanned: scan.docs.size,
        findings: scan.findings.slice(0, MAX_STORED_FINDINGS),
        findingsTotal: scan.findings.length,
        issues,
        docsUpdated: pr.prAction === 'opened' || pr.prAction === 'updated' ? (reviewed?.files.length ?? 0) : 0,
        costUsd: reviewed?.costUsd ?? null,
        ...pr,
      });
      await this.repo.markRepoChecked(repoId, sha);
    } catch (err) {
      await this.repo
        .saveResult(runId, repoId, { status: 'failed', error: summarizeError((err as Error).message) })
        .catch(() => undefined);
    } finally {
      await this.finishIfComplete(runId).catch(() => undefined);
    }
  }

  /**
   * Advance the clone to the default branch's tip. Skipped (current tree is
   * checked as-is, and no PR is opened from it) when Project Context has
   * saved-but-uncommitted doc edits there — `reset --hard` would discard them
   * (same guard as repo-intel resync).
   */
  private async syncClone(repo: RepoRow): Promise<{ sha: string; synced: boolean }> {
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    const modified = filterAllowedPaths(await this.container.gitStatus.modifiedPaths(repo.clonePath!));
    if (modified.length === 0) await this.container.git.sync(ref, repo.defaultBranch);
    return { sha: await this.container.git.currentHead(ref), synced: modified.length === 0 };
  }

  /** Files changed since the last check, with their diffs. Empty when the old
   *  sha isn't reachable in the shallow clone — the review then relies on the
   *  deterministic findings only. */
  private async changedFiles(repo: RepoRow, from: string, to: string): Promise<ChangedFiles> {
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      const files = await this.container.git.diffNameOnly(ref, from, to);
      const diffs = splitRawDiff((await this.container.git.diff(ref, from, to)).raw);
      return { files, diffs };
    } catch {
      return { files: [], diffs: new Map() };
    }
  }

  private async scan(repo: RepoRow): Promise<ScanResult> {
    const clonePath = repo.clonePath!;
    const tree = await this.repo.walkClone(clonePath);
    const scripts = new Set<string>();
    for (const pkg of tree.packageJsons) {
      const text = await this.repo.readText(clonePath, pkg);
      try {
        const parsed = text ? (JSON.parse(text) as { scripts?: Record<string, unknown> }) : null;
        for (const name of Object.keys(parsed?.scripts ?? {})) scripts.add(name);
      } catch {
        // Malformed package.json — its scripts simply aren't known.
      }
    }
    const ctx: CheckContext = {
      paths: tree.paths,
      byBasename: buildPathIndex(tree.paths),
      scripts,
      hasPackageJson: tree.packageJsons.length > 0,
    };
    const docs = new Map<string, string>();
    const findings: DocSyncFinding[] = [];
    for (const path of [...tree.paths].filter(isDocPath).sort()) {
      const raw = await this.repo.readText(clonePath, path);
      if (raw === null) continue;
      // LF like the blob on GitHub (a Windows clone checks out CRLF) — LLM
      // quotes and search/replace edits are matched against this text.
      const content = raw.replace(/\r\n/g, '\n');
      docs.set(path, content);
      findings.push(...checkDoc(path, content, ctx));
    }
    // A path that .gitignore matches is runtime/build output (`results/x.jsonl`),
    // absent from every clone by design — not a stale reference.
    const ignored = new Set(
      await this.container.git.ignoredPaths({ owner: repo.owner, name: repo.name }, [
        ...new Set(findings.flatMap(findingPathForms)),
      ]),
    );
    const kept = findings.filter((f) => !findingPathForms(f).some((p) => ignored.has(p)));
    return { docs, findings: kept, ctx };
  }

  /**
   * LLM stage. Candidates: docs with deterministic findings first, then docs
   * related to files changed since the last check; capped per repo. Per doc
   * the judge lists grounded issues (the quote must exist verbatim, confidence
   * ≥ threshold), the editor proposes search/replace edits, and the result is
   * kept only if it stays small and adds no new broken link / path / script.
   */
  /**
   * If the docs PR we opened was closed without merging, its claims become
   * "dismissed" and are never proposed again (until cleared in Settings).
   * Best effort: GitHub being unreachable just keeps the current list.
   */
  private async refreshDismissed(repo: RepoRow): Promise<Set<string>> {
    let dismissed = repo.docSyncDismissed;
    if (repo.docSyncPrClaims.length > 0) {
      try {
        const pr = await (await this.container.github()).latestPr({ owner: repo.owner, name: repo.name }, DOCS_BRANCH);
        if (pr?.state === 'closed') {
          if (!pr.merged) {
            const known = new Set(dismissed.map(claimKey));
            dismissed = [...dismissed, ...repo.docSyncPrClaims.filter((c) => !known.has(claimKey(c)))];
          }
          await this.repo.setClaims(repo.id, { docSyncPrClaims: [], docSyncDismissed: dismissed });
        }
      } catch {
        // keep the current list
      }
    }
    return new Set(dismissed.map(claimKey));
  }

  private async review(
    workspaceId: string,
    scan: ScanResult,
    changed: ChangedFiles,
    dismissed: Set<string>,
  ): Promise<ReviewOutcome> {
    const outcome: ReviewOutcome = { files: [], issues: [], summaries: [], costUsd: 0 };
    const relates = (path: string, file: string) =>
      docRelatesTo(path, scan.docs.get(path)!, file, scan.ctx.paths.has(file));
    const withFindings = [...new Set(scan.findings.map((f) => f.path))];
    const related = [...scan.docs.keys()].filter(
      (path) => !withFindings.includes(path) && changed.files.some((f) => relates(path, f)),
    );
    const candidates = [...withFindings, ...related]
      .filter((path) => scan.docs.get(path)!.length <= MAX_DOC_CHARS_FOR_LLM)
      .slice(0, MAX_LLM_DOCS_PER_REPO);
    if (candidates.length === 0) return outcome;

    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'doc_sync');
    const llm = await this.container.llm(provider);

    for (const path of candidates) {
      const content = scan.docs.get(path)!;
      const docFindings = scan.findings.filter((f) => f.path === path);
      const evidence: PromptEvidence = {
        changedFiles: changed.files.slice(0, MAX_CHANGED_FILES_LISTED),
        findings: docFindings.map((f) => ({
          line: f.line,
          kind: f.kind,
          target: f.target,
          candidates: f.kind === 'unknown_script' ? [] : pathCandidates(f.target, scan.ctx.byBasename),
        })),
        code: changed.files
          .filter((f) => relates(path, f))
          .slice(0, MAX_CODE_EXCERPTS_PER_DOC)
          .map((f) => ({ path: f, excerpt: (changed.diffs.get(f) ?? '').slice(0, MAX_CODE_EXCERPT_CHARS) }))
          .filter((c) => c.excerpt.length > 0),
      };

      const judged = await this.callStructured(
        llm,
        model,
        JudgeResponse,
        'doc_sync_judge',
        JUDGE_SYSTEM_PROMPT,
        buildJudgeMessage(path, content, evidence),
      );
      outcome.costUsd += judged.cost;
      // Grounding: a claim that isn't a verbatim quote of the doc is dropped.
      const issues = judged.data.issues.filter(
        (i) =>
          i.confidence >= JUDGE_MIN_CONFIDENCE &&
          i.claim.trim().length > 0 &&
          content.includes(i.claim) &&
          !dismissed.has(claimKey({ path, claim: i.claim })),
      );
      if (issues.length === 0) continue;

      const edited = await this.callStructured(
        llm,
        model,
        EditorResponse,
        'doc_sync_edits',
        EDITOR_SYSTEM_PROMPT,
        buildEditorMessage(path, content, issues, evidence),
      );
      outcome.costUsd += edited.cost;
      let { content: next, applied } = applyEdits(content, edited.data.edits);
      if (diagramProblem(content, next, MAX_DIAGRAM_LINES, MAX_DIAGRAM_NODES)) {
        // Keep the text fixes, drop every edit that adds or changes a diagram.
        ({ content: next, applied } = applyEdits(
          content,
          edited.data.edits.filter((e) => !touchesDiagram(content, e)),
        ));
      }
      const acceptable =
        applied > 0 &&
        next.trim().length > 0 &&
        changedLineCount(content, next) <= MAX_CHANGED_LINES_PER_DOC &&
        // Baseline is the unfiltered check, so a kept git-ignored path isn't "new".
        newFindings(checkDoc(path, content, scan.ctx), checkDoc(path, next, scan.ctx)).length === 0;

      const docIssues = issues.map((i) => ({
        path,
        claim: i.claim,
        problem: i.problem,
        fixed: acceptable && !next.includes(i.claim),
      }));
      outcome.issues.push(...docIssues);
      const fixed = docIssues.filter((i) => i.fixed);
      if (!acceptable || fixed.length === 0) continue;
      outcome.files.push({ path, contents: next });
      outcome.summaries.push({ path, issues: fixed });
    }
    return outcome;
  }

  private async callStructured<T>(
    llm: LLMProvider,
    model: string,
    schema: z.ZodType<T>,
    schemaName: string,
    system: string,
    user: string,
  ): Promise<{ data: T; cost: number }> {
    const res = await withTimeout(
      llm.completeStructured({
        model,
        schema,
        schemaName,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      LLM_CALL_TIMEOUT_MS,
    );
    return { data: schema.parse(res.data), cost: res.costUsd ?? 0 };
  }

  /**
   * Commit the edited docs as ONE commit on `devdigest/docs-sync`, re-based on
   * the default branch's tip, and open (as a draft) or update the PR. Never
   * merges. Refuses when the branch tip isn't the commit we pushed last (a
   * human pushed there) or when the clone isn't at the default branch's tip.
   */
  private async publishPr(repo: RepoRow, sha: string, review: ReviewOutcome, remainingFindings: number): Promise<PrOutcome> {
    const ref: RepoRef = { owner: repo.owner, name: repo.name };
    try {
      const gh = await this.container.github();
      if ((await gh.getBranchSha(ref, repo.defaultBranch)) !== sha) {
        return {
          prUrl: null,
          prAction: 'failed',
          prError: `Clone is not at ${repo.defaultBranch}'s tip — PR skipped, the next run retries`,
        };
      }
      const open = await gh.findOpenPr(ref, DOCS_BRANCH);
      const branchTip = await gh.getBranchSha(ref, DOCS_BRANCH);
      if (branchTip && branchTip !== repo.docSyncBranchSha) {
        return {
          prUrl: open?.url ?? null,
          prAction: 'branch_moved',
          prError: `${DOCS_BRANCH} has commits DevDigest didn't make — left untouched`,
        };
      }
      const body = buildPrBody({ sha, docs: review.summaries, remainingFindings });
      const commit = await gh.commitFiles(ref, {
        branch: DOCS_BRANCH,
        base: repo.defaultBranch,
        message: COMMIT_MESSAGE,
        files: review.files,
        resetToBase: true,
      });
      await this.repo.markBranchSha(repo.id, commit.sha);
      await this.repo.setClaims(repo.id, {
        docSyncPrClaims: review.summaries.flatMap((d) => d.issues.map((i) => ({ path: d.path, claim: i.claim }))),
      });
      if (open) {
        await gh.updatePullRequest(ref, open.number, { title: PR_TITLE, body });
        return { prUrl: open.url, prAction: 'updated', prError: null };
      }
      const created = await gh.openPullRequest(ref, {
        title: PR_TITLE,
        head: DOCS_BRANCH,
        base: repo.defaultBranch,
        body,
        draft: true,
      });
      return { prUrl: created.url, prAction: 'opened', prError: null };
    } catch (err) {
      return { prUrl: null, prAction: 'failed', prError: summarizeError((err as Error).message) };
    }
  }

  private async finishIfComplete(runId: string): Promise<void> {
    const done = await this.repo.finishIfComplete(runId);
    if (!done) return;
    const { results } = done;
    await this.container.notifications.notify(
      done.workspaceId,
      docSyncNotification({
        repos: results.length,
        stale: results.filter((r) => r.status === 'stale').length,
        failed: results.filter((r) => r.status === 'failed').length,
        findings: results.reduce((sum, r) => sum + r.findingsTotal + r.issues.length, 0),
        prs: results.filter((r) => r.prAction === 'opened' || r.prAction === 'updated').length,
      }),
    );
  }

  // ---- ticker -----------------------------------------------------------

  /** Reap runs a dead process left `running`, then tick every TICK_MS (AC-4, AC-9). */
  async startScheduler(log: {
    info: (o: object, m: string) => void;
    warn: (o: object, m: string) => void;
  }): Promise<void> {
    try {
      const reaped = await this.repo.reapRunning();
      if (reaped > 0) log.info({ reaped }, 'reaped interrupted doc-sync runs on boot');
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'doc-sync reaping failed (non-fatal)');
    }
    const tick = () => this.tick().catch((err) => log.warn({ err: (err as Error).message }, 'doc-sync tick failed'));
    this.timer = setInterval(tick, TICK_MS);
    this.timer.unref();
    void tick();
  }

  stopScheduler(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Start every due schedule's run (or skip a stale miss), then advance it. */
  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const schedule of await this.repo.dueSchedules(now)) {
        const decision = decideTick(schedule.nextRunAt, now);
        if (decision === 'wait') continue;
        if (decision === 'run') {
          await this.startRun(schedule.workspaceId, 'scheduled').catch(() => {
            // in progress / nothing enabled — the slot is still consumed below
          });
        }
        await this.repo.updateSchedule(schedule.workspaceId, advance(schedule, now));
      }
    } finally {
      this.ticking = false;
    }
  }
}

function claimKey(c: { path: string; claim: string }): string {
  return `${c.path}\u0000${c.claim}`;
}

/** Deterministic findings the PR leaves in place: doc not edited, or target still there. */
function remainingFindings(findings: DocSyncFinding[], files: { path: string; contents: string }[]): number {
  const edited = new Map(files.map((f) => [f.path, f.contents]));
  return findings.filter((f) => !edited.has(f.path) || edited.get(f.path)!.includes(f.target)).length;
}

/** Schedule state after a due slot was consumed (run or missed). */
function advance(s: ScheduleRow, now: Date): Partial<ScheduleRow> {
  if (!s.repeat) return { nextRunOverride: null, enabled: false, nextRunAt: null };
  return { nextRunOverride: null, nextRunAt: nextOccurrence(s, now) };
}

function toScheduleDto(row: ScheduleRow): DocSyncSchedule {
  return {
    enabled: row.enabled,
    time: row.time,
    days: row.days,
    repeat: row.repeat,
    timezone: row.timezone,
    next_run_override: row.nextRunOverride?.toISOString() ?? null,
    next_run_at: row.nextRunAt?.toISOString() ?? null,
    last_run_at: row.lastRunAt?.toISOString() ?? null,
  };
}

function toRepoDto(row: RepoRow): DocSyncRepo {
  return {
    id: row.id,
    full_name: row.fullName,
    enabled: row.docSyncEnabled,
    cloned: Boolean(row.clonePath),
    last_checked_sha: row.docSyncLastSha,
    last_checked_at: row.docSyncCheckedAt?.toISOString() ?? null,
    dismissed: row.docSyncDismissed.length,
  };
}

function toRunDto(run: RunRow, results: (ResultRow & { repoFullName: string })[]): DocSyncRun {
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    error: run.error,
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt?.toISOString() ?? null,
    results: results.map((r) => ({
      repo_id: r.repoId,
      repo_full_name: r.repoFullName,
      status: r.status,
      checked_sha: r.checkedSha,
      docs_scanned: r.docsScanned,
      findings: r.findings,
      findings_total: r.findingsTotal,
      error: r.error,
      issues: r.issues,
      docs_updated: r.docsUpdated,
      pr_url: r.prUrl,
      pr_action: r.prAction,
      pr_error: r.prError,
      cost_usd: r.costUsd,
    })),
  };
}
