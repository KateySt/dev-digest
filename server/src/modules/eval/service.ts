import type { Container } from '../../platform/container.js';
import type {
  AgentEvalRuns,
  AgentEvalStats,
  EvalCase,
  EvalCaseKind,
  EvalCaseListItem,
  EvalCaseRun,
  EvalCompare,
  EvalCrossAgentDashboard,
  EvalOwnerKind,
  EvalPerTrace,
  EvalRange,
  EvalRun,
  EvalSuiteRunDetail,
  LLMProvider,
  Provider,
  ReviewStrategy,
  RunAllAgentsResponse,
  SkillScanFinding,
  SkillScanStatus,
  StartEvalRunResponse,
  UnifiedDiff,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import {
  aggregateSuiteScores,
  computeEvalMetrics,
  reviewPullRequest,
  scoreEvalCase,
} from '@devdigest/reviewer-core';
import type { EvalCaseScore, EvalSuiteCaseInput } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { isScanBlocking } from '../skills/helpers.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { EvalRepository, type InsertEvalRun } from './repository.js';
import type { AgentRow, EvalCaseRow, EvalSuiteRunRow } from '../../db/rows.js';
import {
  aggregateLatestRuns,
  asCaseKind,
  buildRegressionAlert,
  compareCaseFlags,
  findingDecision,
  findingLocation,
  freezeFileHunks,
  inputFingerprint,
  isFullFileFinding,
  isUniqueViolation,
  kebabName,
  metricDeltas,
  parseLocations,
  rangeStart,
  toEvalCaseDto,
  toEvalCaseListItem,
  toEvalCaseRunDto,
  toEvalSuiteRunDto,
} from './helpers.js';
import {
  DASHBOARD_HISTORY_SCAN_LIMIT,
  DASHBOARD_RECENT_RUNS_LIMIT,
  EVAL_HISTORY_LIMIT,
  INTERRUPTED_REASON,
  SKILL_EVAL_SYSTEM_PROMPT,
} from './constants.js';
import { AppError, ConflictError, NotFoundError } from '../../platform/errors.js';

/** What a case execution needs to call `reviewPullRequest` — built differently
 *  for an agent-owned case (its own prompt/model/linked skills) vs a
 *  skill-owned case (baseline prompt, just that skill, workspace default
 *  model) by `buildAgentReviewInput` / `buildSkillReviewInput`. */
interface ReviewInputPlan {
  systemPrompt: string;
  model: string;
  llm: LLMProvider;
  strategy: ReviewStrategy;
  skillBodies: string[];
}

/** Result of executing ONE case through the reviewer + the pure scorer. */
interface CaseExecution {
  actual: unknown;
  score: EvalCaseScore;
  kept: number;
  dropped: number;
  durationMs: number;
  costUsd: number | null;
  fingerprint: string;
}

/** Minimal logger surface (Fastify's pino logger satisfies it). */
export interface EvalLogger {
  error: (obj: unknown, msg?: string) => void;
}

export interface CreateEvalCaseInput {
  owner_kind: EvalOwnerKind;
  owner_id: string;
  name: string;
  kind?: EvalCaseKind;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

export interface UpdateEvalCaseInput {
  name?: string;
  input_diff?: string;
  input_files?: unknown;
  input_meta?: unknown;
  expected_output?: unknown;
  notes?: string;
}

/**
 * Eval service. Backs the Agent/Skill Editors' Evals tabs, the Eval Case
 * Editor modal, the per-agent and cross-agent dashboards and Compare.
 *
 * Agent suite runs are versioned: one `eval_suite_runs` row per run, executed
 * sequentially in the background (fire-and-forget, not JobRunner) against the
 * agent's current config + current skill bodies, using only each case's frozen
 * fields. Scoring is pure (reviewer-core), no model call.
 *
 * Skill-owned cases keep their previous behaviour (single-case runs and the
 * batch "Run all evals"), scored with the new file+line-overlap scorer.
 */
export class EvalService {
  private repo: EvalRepository;

  constructor(
    private container: Container,
    private log?: EvalLogger,
  ) {
    this.repo = new EvalRepository(container.db);
  }

  // ---------------------------------------------------------------------------
  // Case CRUD
  // ---------------------------------------------------------------------------

  async listForOwner(workspaceId: string, ownerKind: string, ownerId: string): Promise<EvalCaseListItem[]> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    const latest = await this.repo.latestRunsForCases(cases.map((c) => c.id));
    return cases.map((c) => toEvalCaseListItem(c, latest.get(c.id)));
  }

  async get(workspaceId: string, id: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, id);
    return row ? toEvalCaseDto(row) : undefined;
  }

  /** Generic create — always `source: manual`; `kind` defaults to `must_find`. */
  async create(workspaceId: string, input: CreateEvalCaseInput): Promise<EvalCase> {
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      kind: input.kind ?? 'must_find',
      source: 'manual',
      inputDiff: input.input_diff,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectedOutput: input.expected_output,
      notes: input.notes,
    });
    return toEvalCaseDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateEvalCaseInput): Promise<EvalCase | undefined> {
    const row = await this.repo.updateCase(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, id);
  }

  // ---------------------------------------------------------------------------
  // Case from a decided finding
  // ---------------------------------------------------------------------------

  /**
   * "Turn into eval case": accepted -> must_find (one expected entry),
   * dismissed -> must_not_flag (one forbidden location). Freezes the finding
   * file's overlapping hunks + PR title/body. Owner = the agent whose review
   * produced the finding. 400 agentless/undecided; 409 `{ case_id }` if a case
   * already exists for the finding.
   */
  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCase> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError('Finding not found');
    const { finding, review, pull, repo } = ctx;

    if (!review.agentId) {
      throw new AppError('no_agent', 'Only findings from an agent review can seed an eval case.', 400);
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, review.agentId);
    if (!agent) {
      throw new AppError('no_agent', 'The agent that produced this finding no longer exists.', 400);
    }
    const decision = findingDecision(finding);
    if (!decision) {
      throw new AppError('finding_undecided', 'Accept or dismiss the finding first.', 400);
    }

    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
    if (existing) throw this.caseExists(existing.id);

    const location = findingLocation(finding);
    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repo);
    const inputDiff = freezeFileHunks(
      diff.raw,
      finding.file,
      isFullFileFinding(finding) ? null : { start: location.start_line, end: location.end_line },
    );

    const accepted = decision === 'accepted';
    try {
      const row = await this.repo.insertCase({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agent.id,
        name: kebabName(finding.title),
        kind: accepted ? 'must_find' : 'must_not_flag',
        source: accepted ? 'finding_accepted' : 'finding_dismissed',
        sourceFindingId: finding.id,
        inputDiff,
        inputMeta: { title: pull.title, body: pull.body },
        expectedOutput: accepted
          ? [
              {
                file: location.file,
                start_line: location.start_line,
                end_line: location.end_line,
                severity: finding.severity,
                category: finding.category,
                title: finding.title,
              },
            ]
          : [location],
      });
      return toEvalCaseDto(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await this.repo.getCaseBySourceFinding(workspaceId, findingId);
        if (raced) throw this.caseExists(raced.id);
      }
      throw err;
    }
  }

  private caseExists(caseId: string): ConflictError {
    return new ConflictError(
      'An eval case already exists for this finding.',
      { case_id: caseId },
      'eval_case_exists',
    );
  }

  // ---------------------------------------------------------------------------
  // Stats (Evals tab header)
  // ---------------------------------------------------------------------------

  async statsForOwner(workspaceId: string, ownerKind: EvalOwnerKind, ownerId: string): Promise<AgentEvalStats> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    const latest = await this.repo.latestRunsForCases(cases.map((c) => c.id));
    const caseResults = cases.flatMap((c) => {
      const r = latest.get(c.id);
      return r ? [toEvalCaseRunDto(r)] : [];
    });

    if (ownerKind === 'agent') {
      const [latestRow, previousRow] = await this.repo.latestCompletedSuiteRuns(workspaceId, ownerId, 2);
      const latestRun = latestRow ? toEvalSuiteRunDto(latestRow) : null;
      const previous = previousRow ? toEvalSuiteRunDto(previousRow) : undefined;
      return {
        cases_total: cases.length,
        cases_evaluated: caseResults.length,
        recall: latestRun?.recall ?? null,
        precision: latestRun?.precision ?? null,
        citation_accuracy: latestRun?.citation_accuracy ?? null,
        delta: latestRun
          ? metricDeltas(latestRun, previous)
          : { recall: null, precision: null, citation_accuracy: null },
        traces_passed: latestRun?.passed_count ?? null,
        traces_evaluated: latestRun?.evaluated_count ?? null,
        latest_run: latestRun,
        case_results: caseResults,
      };
    }

    // Skill owner: unchanged rollup (average of each case's latest run); no suite runs.
    const agg = aggregateLatestRuns(cases.map((c) => latest.get(c.id)));
    return {
      cases_total: cases.length,
      cases_evaluated: agg.cases_evaluated,
      recall: agg.recall,
      precision: agg.precision,
      citation_accuracy: agg.citation_accuracy,
      delta: { recall: null, precision: null, citation_accuracy: null },
      traces_passed: null,
      traces_evaluated: null,
      latest_run: null,
      case_results: caseResults,
    };
  }

  // ---------------------------------------------------------------------------
  // Single-case run (no suite link)
  // ---------------------------------------------------------------------------

  /** Run ONE eval case against its owner (agent or skill); persists + returns
   *  the `eval_runs` row with NO suite-run link (never in history/compare). */
  async runCase(workspaceId: string, caseId: string): Promise<EvalCaseRun> {
    const row = await this.repo.getCase(workspaceId, caseId);
    if (!row) throw new NotFoundError('Eval case not found');

    const plan =
      row.ownerKind === 'agent'
        ? await this.buildAgentReviewInput(workspaceId, row.ownerId)
        : await this.buildSkillReviewInput(workspaceId, row.ownerId);

    const exec = await this.executeCase(row, plan);
    const saved = await this.repo.insertRun(this.toInsertRun(row, exec, null));
    return toEvalCaseRunDto(saved);
  }

  private async buildAgentReviewInput(workspaceId: string, agentId: string): Promise<ReviewInputPlan> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Owning agent not found');
    const linkedSkills = await this.container.agentsRepo.linkedSkills(agent.id);
    const skillBodies = linkedSkills
      .filter(
        (l) =>
          l.skill.enabled &&
          !isScanBlocking(l.skill.scanStatus as SkillScanStatus, l.skill.scanFindings as SkillScanFinding[] | null),
      )
      .map((l) => l.skill.body);
    const llm = await this.container.llm(agent.provider as Provider);
    return { systemPrompt: agent.systemPrompt, model: agent.model, llm, strategy: agent.strategy ?? 'auto', skillBodies };
  }

  private async buildSkillReviewInput(workspaceId: string, skillId: string): Promise<ReviewInputPlan> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Owning skill not found');
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'skill_eval');
    const llm = await this.container.llm(provider);
    return {
      systemPrompt: SKILL_EVAL_SYSTEM_PROMPT,
      model,
      llm,
      strategy: 'auto',
      skillBodies: [skill.body],
    };
  }

  /** Review the case's FROZEN diff/meta and score it. Nothing is re-fetched. */
  private async executeCase(row: EvalCaseRow, plan: ReviewInputPlan): Promise<CaseExecution> {
    const diff: UnifiedDiff = parseUnifiedDiff(row.inputDiff ?? '');
    const meta = (row.inputMeta ?? {}) as { title?: string; body?: string };
    const task = meta.title ? `Review eval case "${row.name}": ${meta.title}` : `Review eval case "${row.name}"`;

    const start = Date.now();
    const outcome = await reviewPullRequest({
      systemPrompt: plan.systemPrompt,
      model: plan.model,
      diff,
      llm: plan.llm,
      strategy: plan.strategy,
      ...(plan.skillBodies.length > 0 ? { skills: plan.skillBodies } : {}),
      ...(meta.body ? { prDescription: meta.body } : {}),
      task,
    });
    const durationMs = Date.now() - start;

    const score = scoreEvalCase(asCaseKind(row.kind), parseLocations(row.expectedOutput), outcome.review.findings);
    return {
      actual: outcome.review.findings,
      score,
      kept: outcome.review.findings.length,
      dropped: outcome.dropped.length,
      durationMs,
      costUsd: outcome.costUsd,
      fingerprint: inputFingerprint(row),
    };
  }

  private toInsertRun(row: EvalCaseRow, exec: CaseExecution, suiteRunId: string | null): InsertEvalRun {
    const m = computeEvalMetrics({ ...exec.score, kept: exec.kept, dropped: exec.dropped });
    return {
      caseId: row.id,
      suiteRunId,
      status: 'ok',
      actualOutput: exec.actual,
      pass: exec.score.pass,
      recall: m.recall,
      precision: m.precision,
      citationAccuracy: m.citationAccuracy,
      durationMs: exec.durationMs,
      costUsd: exec.costUsd,
      inputFingerprint: exec.fingerprint,
      expectedTotal: exec.score.expectedTotal,
      matched: exec.score.matched,
      groundedTotal: exec.score.groundedTotal,
      noise: exec.score.noise,
      kept: exec.kept,
      dropped: exec.dropped,
    };
  }

  // ---------------------------------------------------------------------------
  // Agent suite runs
  // ---------------------------------------------------------------------------

  /**
   * `POST /agents/:id/eval-runs`: snapshot the agent if needed, insert a
   * `running` suite run (409 if one is already running - enforced by the
   * partial unique index), kick off background execution and return at once.
   */
  async startAgentRun(workspaceId: string, agentId: string): Promise<StartEvalRunResponse> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const cases = await this.repo.listCases(workspaceId, 'agent', agentId);
    if (cases.length === 0) {
      throw new AppError('no_cases', 'This agent has no eval cases to run.', 400);
    }

    const run = await this.insertRunningSuite(workspaceId, agent, cases.length);
    void this.executeSuite(run, agent, cases).catch((err) =>
      this.log?.error({ err, runId: run.id }, 'eval suite run crashed'),
    );
    return { run_id: run.id, status: 'running', cases_total: cases.length };
  }

  private async insertRunningSuite(
    workspaceId: string,
    agent: AgentRow,
    casesTotal: number,
  ): Promise<EvalSuiteRunRow> {
    await this.container.agentsService.ensureSnapshot(agent);
    try {
      return await this.repo.insertSuiteRun({
        workspaceId,
        agentId: agent.id,
        agentVersion: agent.version,
        casesTotal,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('An eval run is already in progress for this agent.', undefined, 'eval_run_in_progress');
      }
      throw err;
    }
  }

  /**
   * `POST /eval-dashboard/run-all`: every enabled agent with >=1 case and no
   * running suite. All `running` rows are inserted up front (so the UI shows
   * every agent as running at once), then the suites execute one after another.
   */
  async runAllAgents(workspaceId: string): Promise<RunAllAgentsResponse> {
    const [agents, counts, running] = await Promise.all([
      this.container.agentsRepo.listEnabled(workspaceId),
      this.repo.caseCountsByAgent(workspaceId),
      this.repo.runningSuiteRunsByAgent(workspaceId),
    ]);

    const started: string[] = [];
    const skipped: string[] = [];
    const queue: { run: EvalSuiteRunRow; agent: AgentRow; cases: EvalCaseRow[] }[] = [];

    for (const agent of agents) {
      if (!counts.get(agent.id)) continue; // not eligible: no cases
      if (running.has(agent.id)) {
        skipped.push(agent.id);
        continue;
      }
      const cases = await this.repo.listCases(workspaceId, 'agent', agent.id);
      try {
        const run = await this.insertRunningSuite(workspaceId, agent, cases.length);
        queue.push({ run, agent, cases });
        started.push(agent.id);
      } catch (err) {
        if (err instanceof ConflictError) skipped.push(agent.id);
        else throw err;
      }
    }

    void (async () => {
      for (const item of queue) {
        try {
          await this.executeSuite(item.run, item.agent, item.cases);
        } catch (err) {
          this.log?.error({ err, runId: item.run.id }, 'eval suite run crashed');
        }
      }
    })();

    return { started, skipped };
  }

  /** Execute a suite's cases sequentially and store pooled results. Never throws on a case failure. */
  private async executeSuite(run: EvalSuiteRunRow, agent: AgentRow, cases: EvalCaseRow[]): Promise<void> {
    const started = Date.now();
    let plan: ReviewInputPlan;
    try {
      plan = await this.buildAgentReviewInput(run.workspaceId, agent.id);
    } catch (err) {
      await this.repo.finishSuiteRun(run.id, {
        status: 'failed',
        failureReason: errorMessage(err),
        recall: null,
        precision: null,
        citationAccuracy: null,
        passedCount: 0,
        evaluatedCount: 0,
        erroredCount: 0,
        durationMs: Date.now() - started,
        costUsd: null,
      });
      return;
    }

    const scored: EvalSuiteCaseInput[] = [];
    let errored = 0;
    let cost: number | null = 0;

    for (const c of cases) {
      try {
        const exec = await this.executeCase(c, plan);
        await this.repo.insertRun(this.toInsertRun(c, exec, run.id));
        scored.push({ ...exec.score, kept: exec.kept, dropped: exec.dropped });
        cost = cost == null || exec.costUsd == null ? null : cost + exec.costUsd;
      } catch (err) {
        errored++;
        try {
          await this.repo.insertRun({
            caseId: c.id,
            suiteRunId: run.id,
            status: 'errored',
            error: errorMessage(err),
            pass: null,
            recall: null,
            precision: null,
            citationAccuracy: null,
            durationMs: null,
            costUsd: null,
            inputFingerprint: inputFingerprint(c),
          });
        } catch (persistErr) {
          this.log?.error({ err: persistErr, caseId: c.id }, 'failed to record errored eval case');
        }
      }
      await this.repo.incrementCasesDone(run.id);
    }

    const pooled = aggregateSuiteScores(scored);
    const completed = pooled.evaluated >= 1;
    await this.repo.finishSuiteRun(run.id, {
      status: completed ? 'completed' : 'failed',
      failureReason: completed ? null : 'every case errored',
      recall: pooled.recall,
      precision: pooled.precision,
      citationAccuracy: pooled.citationAccuracy,
      passedCount: pooled.passed,
      evaluatedCount: pooled.evaluated,
      erroredCount: errored,
      durationMs: Date.now() - started,
      costUsd: completed ? cost : null,
    });
  }

  /** Boot reaper (next to `reapStaleRuns`): suite runs left `running` by a dead process. */
  async reapStaleSuiteRuns(): Promise<number> {
    return this.repo.failRunningSuiteRuns(INTERRUPTED_REASON);
  }

  /** `GET /eval-suite-runs/:id` — progress + per-case results (incl. errored). */
  async getSuiteRun(workspaceId: string, id: string): Promise<EvalSuiteRunDetail> {
    const run = await this.repo.getSuiteRun(workspaceId, id);
    if (!run) throw new NotFoundError('Eval run not found');
    const results = await this.repo.resultsForSuiteRun(id);
    return {
      ...toEvalSuiteRunDto(run),
      results: results.map((r) => ({ ...toEvalCaseRunDto(r.run), case_name: r.caseName })),
    };
  }

  // ---------------------------------------------------------------------------
  // History / dashboards / compare
  // ---------------------------------------------------------------------------

  /** `GET /agents/:id/eval-runs?range=` — runs in range (newest first), all-time history, alert. */
  async listAgentRuns(workspaceId: string, agentId: string, range: EvalRange): Promise<AgentEvalRuns> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [runs, completed, counts] = await Promise.all([
      this.repo.listSuiteRuns(agentId, rangeStart(range, new Date())),
      this.repo.latestCompletedSuiteRuns(workspaceId, agentId, EVAL_HISTORY_LIMIT),
      this.repo.caseCountsByAgent(workspaceId),
    ]);
    const history = completed.map(toEvalSuiteRunDto).reverse(); // oldest first
    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    return {
      runs: runs.map(toEvalSuiteRunDto),
      history,
      alert: buildRegressionAlert(latest, previous),
      cases_total: counts.get(agentId) ?? 0,
    };
  }

  /** `GET /agents/:id/eval-runs/compare` — `old`/`new` ordered by agent version. */
  async compare(workspaceId: string, agentId: string, baseId: string, headId: string): Promise<EvalCompare> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [a, b] = await Promise.all([
      this.repo.getSuiteRun(workspaceId, baseId),
      this.repo.getSuiteRun(workspaceId, headId),
    ]);
    if (!a || !b) throw new NotFoundError('Eval run not found');
    if (a.agentId !== b.agentId || a.agentId !== agentId) {
      throw new AppError('agent_mismatch', 'Both runs must belong to this agent.', 400);
    }

    const [older, newer] =
      a.agentVersion !== b.agentVersion
        ? a.agentVersion < b.agentVersion
          ? [a, b]
          : [b, a]
        : a.startedAt <= b.startedAt
          ? [a, b]
          : [b, a];
    const oldDto = toEvalSuiteRunDto(older);
    const newDto = toEvalSuiteRunDto(newer);

    const [oldConfig, newConfig, prints] = await Promise.all([
      this.versionConfig(agentId, older.agentVersion),
      this.versionConfig(agentId, newer.agentVersion),
      this.repo.fingerprintsForSuiteRuns([older.id, newer.id]),
    ]);
    const forRun = (id: string) =>
      prints.filter((p) => p.suiteRunId === id).map((p) => ({ caseId: p.caseId, fingerprint: p.fingerprint }));
    const flags = compareCaseFlags(forRun(older.id), forRun(newer.id));

    const delta = metricDeltas(newDto, oldDto);
    return {
      old: { run: oldDto, config: oldConfig },
      new: { run: newDto, config: newConfig },
      deltas: {
        ...delta,
        cost_usd:
          newDto.cost_usd == null || oldDto.cost_usd == null ? null : newDto.cost_usd - oldDto.cost_usd,
      },
      ...flags,
    };
  }

  private async versionConfig(agentId: string, version: number): Promise<AgentVersionConfig | null> {
    const row = await this.container.agentsRepo.getVersion(agentId, version);
    if (!row) return null;
    const parsed = AgentVersionConfig.safeParse(row.configJson);
    return parsed.success ? parsed.data : null;
  }

  /** `GET /eval-dashboard` — per-agent latest run + sparkline history + running state, and recent runs. */
  async dashboard(workspaceId: string): Promise<EvalCrossAgentDashboard> {
    const [agents, counts, completed, running, recent] = await Promise.all([
      this.container.agentsRepo.list(workspaceId),
      this.repo.caseCountsByAgent(workspaceId),
      this.repo.completedSuiteRunsForWorkspace(workspaceId, DASHBOARD_HISTORY_SCAN_LIMIT),
      this.repo.runningSuiteRunsByAgent(workspaceId),
      this.repo.recentSuiteRunsForWorkspace(workspaceId, DASHBOARD_RECENT_RUNS_LIMIT),
    ]);

    return {
      agents: agents.map((agent) => {
        // `completed` is newest first; keep the newest N then flip to chronological.
        const own = completed.filter((r) => r.agentId === agent.id).slice(0, EVAL_HISTORY_LIMIT);
        const latest = own[0];
        const runningRun = running.get(agent.id);
        return {
          agent_id: agent.id,
          agent_name: agent.name,
          model: agent.model,
          cases_total: counts.get(agent.id) ?? 0,
          latest_run: latest ? toEvalSuiteRunDto(latest) : null,
          history: [...own].reverse().map((r) => ({
            recall: r.recall,
            precision: r.precision,
            citation_accuracy: r.citationAccuracy,
          })),
          running_run: runningRun
            ? { id: runningRun.id, cases_done: runningRun.casesDone, cases_total: runningRun.casesTotal }
            : null,
        };
      }),
      recent_runs: recent.map((r) => ({ ...toEvalSuiteRunDto(r.run), agent_name: r.agentName })),
    };
  }

  // ---------------------------------------------------------------------------
  // Skill-owned batch ("Run all evals" on a skill) - unchanged semantics
  // ---------------------------------------------------------------------------

  /** "Run all evals" on a skill's Evals tab — sequential batch over that
   *  owner's cases (single-case results, no suite run). */
  async runAllForOwner(workspaceId: string, ownerKind: EvalOwnerKind, ownerId: string): Promise<EvalRun> {
    const cases = await this.repo.listCases(workspaceId, ownerKind, ownerId);
    return this.runBatch(workspaceId, cases);
  }

  private async runBatch(workspaceId: string, cases: EvalCaseRow[]): Promise<EvalRun> {
    const perTrace: EvalPerTrace[] = [];
    let tracesPassed = 0;
    let durationTotal = 0;
    let costTotal: number | null = 0;
    const recalls: number[] = [];
    const precisions: number[] = [];
    const citations: number[] = [];

    for (const c of cases) {
      let run: EvalCaseRun;
      try {
        run = await this.runCase(workspaceId, c.id);
      } catch {
        continue; // one bad case (e.g. missing owner) doesn't sink the whole batch
      }
      perTrace.push({
        name: c.name,
        pass: run.pass ?? false,
        expected: c.expectedOutput,
        actual: run.actual_output,
      });
      if (run.pass) tracesPassed++;
      if (run.duration_ms != null) durationTotal += run.duration_ms;
      costTotal = costTotal == null || run.cost_usd == null ? null : costTotal + run.cost_usd;
      if (run.recall != null) recalls.push(run.recall);
      if (run.precision != null) precisions.push(run.precision);
      if (run.citation_accuracy != null) citations.push(run.citation_accuracy);
    }

    const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return {
      recall: avg(recalls),
      precision: avg(precisions),
      citation_accuracy: avg(citations),
      traces_passed: tracesPassed,
      traces_total: perTrace.length,
      duration_ms: durationTotal,
      cost_usd: costTotal,
      per_trace: perTrace,
    };
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
