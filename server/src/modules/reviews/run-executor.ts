import type { Container } from '../../platform/container.js';
import type {
  Provider,
  Review,
  RunTrace,
  SkillScanFinding,
  SkillScanStatus,
  SpecReadEntry,
  TraceGrounding,
  UnifiedDiff,
} from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';

type ReviewOutcome = Awaited<ReturnType<typeof reviewPullRequest>>;
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';
import { isScanBlocking } from '../skills/helpers.js';
import { IntentService } from '../intent/service.js';
import { renderIntentDigest } from '../intent/helpers.js';
import { ProjectContextService } from '../project-context/service.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/** Shared, once-per-group input every agent of a group receives (S-AC-14). */
type Prepared = { diff: UnifiedDiff; intentDigest: string | undefined };

/** Structured grounding result for the trace (S-AC-40) from a review outcome. */
function groundingForTrace(outcome: ReviewOutcome): TraceGrounding {
  const kept = outcome.review.findings.length;
  return {
    kept,
    total: kept + outcome.dropped.length,
    dropped: outcome.dropped.map((d) => ({
      title: d.finding.title,
      file: d.finding.file,
      start_line: d.finding.start_line,
      end_line: d.finding.end_line,
      reason: d.reason,
    })),
  };
}

/**
 * Owns the background execution of queued agent runs. Every run of a group
 * (one PR trigger: single, `all`, `agentIds`, a bulk PR, a rerun) is enqueued
 * on the process-wide `container.reviewQueue`; the diff + intent are prepared
 * ONCE per group, lazily, by whichever job takes a slot first (its siblings
 * await the same promise). Per-agent failures are isolated; a failed
 * preparation fails the whole group and removes its still-queued siblings.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of freshly created `queued` runs (NOT awaited by the
   * route). Enqueues every job SYNCHRONOUSLY (so FIFO order == call order and
   * queue positions exist as soon as the caller returns), then resolves when
   * every job has finished or been removed. Never rejects.
   */
  executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
    opts: { groupKey?: string } = {},
  ): Promise<void> {
    const queue = this.container.reviewQueue;
    const groupKey = opts.groupKey ?? jobs[0]?.runId ?? pull.id;
    // ONE logger fanned out over every run of the group: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Preparation failure fails EVERY run of the group (S-AC-16) and takes the
    // still-queued siblings out of the queue so none starts. The error was
    // already emitted via runLog (fanned out -> in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId } of jobs) queue.remove(runId);
      for (const { runId, agent } of jobs) {
        const wrote = await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: null,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => false);
        if (!wrote) continue; // already cancelled by the user - leave it alone
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    const doPrepare = async (): Promise<Prepared | null> => {
      let diff: UnifiedDiff;
      try {
        diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
          kind: 'tool',
        });
      } catch (err) {
        runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
        await failAll(`Failed to load PR diff: ${(err as Error).message}`);
        return null;
      }
      runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

      // Best-effort, non-fatal: intent derivation is advisory. A failure here
      // (e.g. the cheap model's provider key missing) must never fail the runs
      // it's shared across — just log it and continue without an intent digest.
      let intentDigest: string | undefined;
      try {
        const intent = await runLog.step(
          'Deriving PR intent',
          () => new IntentService(this.container).getOrCompute(workspaceId, pull, repo, runLog),
          { kind: 'tool' },
        );
        intentDigest = renderIntentDigest(intent);
      } catch (err) {
        runLog.info(`Failed to derive PR intent: ${(err as Error).message} — continuing without it`);
      }
      return { diff, intentDigest };
    };
    let preparing: Promise<Prepared | null> | undefined;
    const prepare = () => (preparing ??= doPrepare());

    const settled = jobs.map(({ agent, runId }) => {
      let started = false;
      return queue.enqueue({
        runId,
        groupKey,
        // queued -> running + started_at. False = cancelled while waiting: skip.
        onStart: async () => {
          started = await this.repo.markRunStarted(runId);
        },
        run: async () => {
          if (!started) return;
          const prepared = await prepare();
          if (!prepared) return; // group failed; rows already marked
          await this.runJob(workspaceId, pull, repo, prepared, agent, runId, runLog, logger);
        },
      });
    });
    return Promise.all(settled).then(() => undefined);
  }

  /** One agent's job inside a group; failures are logged here, never thrown. */
  private async runJob(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    prepared: Prepared,
    agent: AgentRow,
    runId: string,
    runLog: RunLogger,
    logger?: Logger,
  ): Promise<void> {
    const agentStart = Date.now();
    logger?.info(
      { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
      `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
    );
    try {
      const outcome = await this.runOneAgent(
        workspaceId,
        pull,
        repo,
        prepared.diff,
        prepared.intentDigest,
        agent,
        runId,
        runLog,
      );
      logger?.info(
        {
          runId,
          agent: agent.name,
          findings: outcome.findings.length,
          grounding: outcome.grounding,
          durationMs: Date.now() - agentStart,
        },
        `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
      );
    } catch (err) {
      // runOneAgent already persisted the failure/cancel (status + error +
      // trace) and completed the bus; here we only log at the run level.
      const cancelled = err instanceof RunCancelledError;
      logger?.[cancelled ? 'info' : 'error'](
        { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
        `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
      );
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    intentDigest: string | undefined,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    // Hoisted so a failure/cancel AFTER the model responded still records its
    // tokens, cost and grounding result (S-AC-40).
    let modelOutcome: ReviewOutcome | undefined;

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.container.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // Linked skills (Agent editor's Skills tab), in `order`, enabled only.
      // A skill unlinked or disabled after being linked has zero effect on the
      // prompt — resolved fresh on every run, never cached on the agent row.
      const linkedSkills = await this.agents.linkedSkills(agent.id);
      const skillBodies = linkedSkills
        .filter((l) => l.skill.enabled && !isScanBlocking(l.skill.scanStatus as SkillScanStatus, l.skill.scanFindings as SkillScanFinding[] | null))
        .map((l) => l.skill.body);
      if (skillBodies.length > 0) {
        runLog.info(`${skillBodies.length} skill(s) attached to prompt`);
      }

      // SPEC-04 — Project Context: resolve the agent's + its skills' attached
      // documents FRESH on every run (nothing cached on the agent row — S-AC-11),
      // independent of the repo-intel toggle above (this has nothing to do with
      // repo-intel). Never fails the run: a resolution error just means no
      // project context this run, same fail-soft contract as callers/repoMap.
      let projectContext: { texts: string[]; specsRead: SpecReadEntry[] } = {
        texts: [],
        specsRead: [],
      };
      try {
        projectContext = await new ProjectContextService(this.container).resolveForRun(
          repo.clonePath,
          agent.id,
          agent.model,
        );
        if (projectContext.texts.length > 0) {
          runLog.info(`${projectContext.texts.length} project-context document(s) attached to prompt`);
        }
      } catch (err) {
        runLog.info(`project context: resolution failed — ${(err as Error).message}`);
      }

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // Skills tab — omit-when-empty, same contract as callers/repoMap below.
        ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
        // SPEC-04 — Project Context, resolved above; omit-when-empty, same idiom.
        ...(projectContext.texts.length > 0 ? { specs: projectContext.texts } : {}),
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Derived intent (shared pre-work, once per PR) — untrusted; omitted
        // when derivation failed (advisory-only, never fails the run).
        ...(intentDigest ? { intent: intentDigest } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      modelOutcome = outcome;
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;
      // A cancel that landed while the model was answering: stop before any
      // review/findings are persisted for a run the user cancelled.
      // (the bus drops its cancel flag on complete(), so the DB row is consulted too).
      if (this.container.runBus.isCancelled(runId) || (await this.repo.isRunCancelled(runId))) {
        throw new RunCancelledError();
      }

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score: outcome.review.score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, keptFindings);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn,
        tokensOut,
        costUsd,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });

      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
          cost_usd: costUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: outcome.assembly,
        tool_calls: outcome.chunks.map((c) => ({
          tool: 'review_file',
          args: c.label,
          meta: outcome.mode,
          ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
        })),
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: projectContext.specsRead,
        grounding: groundingForTrace(outcome),
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      const failedGrounding = modelOutcome ? modelOutcome.grounding : '0/0 passed';
      const wrote = await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: modelOutcome?.tokensIn ?? 0,
          tokensOut: modelOutcome?.tokensOut ?? 0,
          costUsd: modelOutcome?.costUsd ?? null,
          findingsCount: 0,
          grounding: failedGrounding,
          error: msg,
        })
        .catch(() => false);
      // `wrote === false` for a non-cancel failure means a cancel landed first:
      // keep that row (and its trace) as the cancel left them.
      if (wrote || cancelled) {
        await this.repo
          .saveRunTrace(
            runId,
            this.traceFromBuffer(runId, pull, agent, failedGrounding, Date.now() - start, modelOutcome),
          )
          .catch(() => undefined);
      }
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
    outcome?: ReviewOutcome,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: {
        duration_ms: durationMs,
        tokens_in: outcome?.tokensIn ?? 0,
        tokens_out: outcome?.tokensOut ?? 0,
        cost_usd: outcome?.costUsd ?? null,
        findings: 0,
        grounding,
      },
      prompt_assembly: outcome?.assembly ?? { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: outcome?.raw ?? '',
      memory_pulled: [],
      specs_read: [],
      ...(outcome ? { grounding: groundingForTrace(outcome) } : {}),
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
