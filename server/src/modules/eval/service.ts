import type { Container } from '../../platform/container.js';
import type {
  AgentEvalRuns,
  AgentEvalStats,
  EvalCase,
  EvalCaseKind,
  EvalCaseListItem,
  EvalCaseRun,
  AnyEvalSuiteRunDetail,
  EvalCaseTarget,
  EvalCompare,
  EvalCrossAgentDashboard,
  EvalCrossSkillDashboard,
  EvalOwnerKind,
  EvalRange,
  EvalSuiteRunDetail,
  LLMProvider,
  Provider,
  ReviewStrategy,
  RunAllAgentsResponse,
  RunAllSkillsResponse,
  SkillEvalCompare,
  SkillEvalRuns,
  SkillEvalSuiteRunDetail,
  SkillScanFinding,
  SkillScanStatus,
  StartEvalRunResponse,
  StartSkillEvalRunResponse,
  UnifiedDiff,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import { computeEvalMetrics, reviewPullRequest, scoreEvalCase } from '@devdigest/reviewer-core';
import type { EvalCaseScore, EvalSuiteCaseInput } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { isScanBlocking } from '../skills/helpers.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { EvalRepository, type InsertEvalRun, type SkillSuiteRunInput } from './repository.js';
import type { AgentRow, EvalCaseRow, EvalSuiteRunRow, SkillRow } from '../../db/rows.js';
import {
  asCaseKind,
  buildRegressionAlert,
  compareCaseFlags,
  findingDecision,
  findingLocation,
  freezeFileHunks,
  inputFingerprint,
  isForeignKeyViolation,
  isFullFileFinding,
  isUniqueViolation,
  kebabName,
  metricDeltas,
  orderRunsForCompare,
  parseLocations,
  rangeStart,
  summarizeSuiteRun,
  toEvalCaseDto,
  toEvalCaseListItem,
  toEvalCaseRunDto,
  toEvalSuiteRunDto,
  toSkillSuiteRunDto,
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
 * Skill suite runs (SPEC-08) use the same table and the same shared runner: the
 * skill's text + version + resolved `skill_eval` model are captured when the
 * run starts; an unsaved-text "draft" run is a suite run with no version that
 * stays out of history / alert / compare / dashboards. Single-case runs on a
 * skill-owned case have no suite link.
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
   * file's overlapping hunks + PR title/body. Target (SPEC-08): the finding's
   * agent by default; or a skill currently linked to that agent. 400
   * agentless/undecided/bad target; 409 `{ case_id }` if a case already exists
   * for the same (finding, target). The target skill's scan status is irrelevant.
   */
  async createFromFinding(workspaceId: string, findingId: string, target?: EvalCaseTarget): Promise<EvalCase> {
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

    const owner = await this.resolveCaseTarget(workspaceId, agent.id, target);

    const existing = await this.repo.getCaseBySourceFinding(workspaceId, findingId, owner.kind, owner.id);
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
        ownerKind: owner.kind,
        ownerId: owner.id,
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
        const raced = await this.repo.getCaseBySourceFinding(workspaceId, findingId, owner.kind, owner.id);
        if (raced) throw this.caseExists(raced.id);
      }
      throw err;
    }
  }

  /** No target -> the finding's agent. An agent target must BE that agent; a skill
   *  target must currently be linked to it. */
  private async resolveCaseTarget(
    workspaceId: string,
    agentId: string,
    target: EvalCaseTarget | undefined,
  ): Promise<{ kind: 'agent' | 'skill'; id: string }> {
    if (!target) return { kind: 'agent', id: agentId };
    if (target.kind === 'agent') {
      if (target.id !== agentId) {
        throw new AppError('invalid_target', "An agent target must be the agent that produced this finding.", 400);
      }
      return { kind: 'agent', id: agentId };
    }
    const linked = await this.container.agentsRepo.linkedSkills(agentId);
    if (!linked.some((l) => l.skill.id === target.id && l.skill.workspaceId === workspaceId)) {
      throw new AppError('skill_not_linked', "That skill isn't linked to the agent that produced this finding.", 400);
    }
    return { kind: 'skill', id: target.id };
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

    // Agent and skill share the rollup: latest two COMPLETED (non-draft) suite
    // runs; `latest_run` is only populated for agents (its contract is the agent run shape).
    const [latestRow, previousRow] =
      ownerKind === 'agent'
        ? await this.repo.latestCompletedSuiteRuns(workspaceId, ownerId, 2)
        : await this.repo.latestCompletedSkillSuiteRuns(workspaceId, ownerId, 2);
    const latestRun = latestRow ? toSuiteDto(latestRow) : null;
    const previous = previousRow ? toSuiteDto(previousRow) : undefined;
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
      latest_run: latestRow && ownerKind === 'agent' ? toEvalSuiteRunDto(latestRow) : null,
      ...(ownerKind === 'skill' ? { latest_skill_run: latestRow ? toSkillSuiteRunDto(latestRow) : null } : {}),
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

  /** Single-case run on a skill-owned case: same 422 scan gate as a suite run (AC-7). */
  private async buildSkillReviewInput(workspaceId: string, skillId: string): Promise<ReviewInputPlan> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Owning skill not found');
    this.assertScanPassed(skill);
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'skill_eval');
    return this.skillPlan(provider, model, skill.body);
  }

  /** Baseline prompt + ONLY this skill's text + the resolved `skill_eval` model. */
  private async skillPlan(provider: Provider, model: string, text: string): Promise<ReviewInputPlan> {
    const llm = await this.container.llm(provider);
    return { systemPrompt: SKILL_EVAL_SYSTEM_PROMPT, model, llm, strategy: 'auto', skillBodies: [text] };
  }

  /** 422 when the skill's scan is blocking, `pending` or `error` (fail-closed; disabled is fine). */
  private assertScanPassed(skill: SkillRow): void {
    const status = skill.scanStatus as SkillScanStatus;
    if (isScanBlocking(status, skill.scanFindings as SkillScanFinding[] | null)) {
      throw new AppError(
        'skill_scan_not_passed',
        `This skill's security scan has not passed (scan status: ${status}), so it cannot be evaluated.`,
        422,
        { scan_status: status },
      );
    }
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
    void this.executeSuite(run, cases, () => this.buildAgentReviewInput(run.workspaceId, agent.id)).catch((err) =>
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
          await this.executeSuite(item.run, item.cases, () =>
            this.buildAgentReviewInput(item.run.workspaceId, item.agent.id),
          );
        } catch (err) {
          this.log?.error({ err, runId: item.run.id }, 'eval suite run crashed');
        }
      }
    })();

    return { started, skipped };
  }

  /**
   * Execute a suite's cases sequentially and store pooled results. Never throws
   * on a case failure. Shared by agent and skill runs; `buildPlan` builds the
   * review input (agent config + linked skills, or baseline prompt + captured
   * skill text). `guardRunRow` (skill runs): stop silently, writing nothing
   * further, once the run row is gone (skill deleted mid-run - AC-36).
   */
  private async executeSuite(
    run: EvalSuiteRunRow,
    cases: EvalCaseRow[],
    buildPlan: () => Promise<ReviewInputPlan>,
    guardRunRow = false,
  ): Promise<void> {
    const started = Date.now();
    let plan: ReviewInputPlan;
    try {
      plan = await buildPlan();
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

    const scored: (EvalSuiteCaseInput & { costUsd: number | null })[] = [];
    let errored = 0;

    for (const c of cases) {
      if (guardRunRow && !(await this.repo.suiteRunExists(run.id))) return;
      try {
        const exec = await this.executeCase(c, plan);
        await this.repo.insertRun(this.toInsertRun(c, exec, run.id));
        scored.push({ ...exec.score, kept: exec.kept, dropped: exec.dropped, costUsd: exec.costUsd });
      } catch (err) {
        // Run row deleted under us (FK violation on the result insert): stop, not errored.
        if (guardRunRow && isForeignKeyViolation(err) && !(await this.repo.suiteRunExists(run.id))) return;
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
          if (guardRunRow && isForeignKeyViolation(persistErr) && !(await this.repo.suiteRunExists(run.id))) return;
          this.log?.error({ err: persistErr, caseId: c.id }, 'failed to record errored eval case');
        }
      }
      await this.repo.incrementCasesDone(run.id);
    }

    const summary = summarizeSuiteRun(scored, errored);
    await this.repo.finishSuiteRun(run.id, { ...summary, durationMs: Date.now() - started });
  }

  // ---------------------------------------------------------------------------
  // Skill suite + draft runs (SPEC-08)
  // ---------------------------------------------------------------------------

  /**
   * `POST /skills/:id/eval-runs`. Checks in order: 404 missing skill -> 400 no
   * cases -> 422 scan not passed (no model call) -> draft when `draftBody`
   * differs from the saved text, else a versioned suite run -> 409 if a run of
   * the skill is already running. The text, version and `skill_eval` model are
   * captured here, before replying 202; the run executes in the background.
   * `draftBody` is held in memory only - never persisted.
   */
  async startSkillRun(
    workspaceId: string,
    skillId: string,
    draftBody?: string,
  ): Promise<StartSkillEvalRunResponse> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const cases = await this.repo.listCases(workspaceId, 'skill', skillId);
    if (cases.length === 0) {
      throw new AppError('no_cases', 'This skill has no eval cases to run.', 400);
    }
    this.assertScanPassed(skill);

    const isDraft = draftBody !== undefined && draftBody !== skill.body;
    const text = isDraft ? draftBody : skill.body;
    const choice = await resolveFeatureModel(this.container, workspaceId, 'skill_eval');
    const run = await this.insertSkillRun(
      {
        workspaceId,
        skillId,
        skillVersion: isDraft ? null : skill.version,
        provider: choice.provider,
        model: choice.model,
        casesTotal: cases.length,
      },
      'This skill already has an eval run in progress.',
    );
    void this.executeSuite(run, cases, () => this.skillPlan(choice.provider, choice.model, text), true).catch((err) =>
      this.log?.error({ err, runId: run.id }, 'skill eval run crashed'),
    );
    return { run_id: run.id, status: 'running', cases_total: cases.length, is_draft: isDraft };
  }

  private async insertSkillRun(input: SkillSuiteRunInput, conflictMessage: string): Promise<EvalSuiteRunRow> {
    try {
      return input.skillVersion == null
        ? await this.repo.replaceSkillDraftRun(input)
        : await this.repo.insertSkillSuiteRun(input);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(conflictMessage, undefined, 'eval_run_in_progress');
      }
      throw err;
    }
  }

  /**
   * `POST /eval-dashboard/skills/run-all`: every skill (disabled included) with
   * >=1 case, skipping a skill whose scan has not passed or that has ANY running
   * run (suite or draft). All `running` rows are inserted up front, then the
   * suites execute one skill after another.
   */
  async runAllSkills(workspaceId: string): Promise<RunAllSkillsResponse> {
    const [skills, counts, running, choice] = await Promise.all([
      this.container.skillsRepo.list(workspaceId),
      this.repo.caseCountsBySkill(workspaceId),
      this.repo.runningSkillRuns(workspaceId),
      resolveFeatureModel(this.container, workspaceId, 'skill_eval'),
    ]);
    const busy = new Set(running.map((r) => r.skillId));

    const started: string[] = [];
    const skipped: string[] = [];
    const queue: { run: EvalSuiteRunRow; cases: EvalCaseRow[]; text: string }[] = [];

    for (const skill of skills) {
      if (!counts.get(skill.id)) continue; // not eligible: no cases
      const blocked = isScanBlocking(skill.scanStatus as SkillScanStatus, skill.scanFindings as SkillScanFinding[] | null);
      if (blocked || busy.has(skill.id)) {
        skipped.push(skill.id);
        continue;
      }
      const cases = await this.repo.listCases(workspaceId, 'skill', skill.id);
      try {
        const run = await this.insertSkillRun(
          {
            workspaceId,
            skillId: skill.id,
            skillVersion: skill.version,
            provider: choice.provider,
            model: choice.model,
            casesTotal: cases.length,
          },
          'This skill already has an eval run in progress.',
        );
        queue.push({ run, cases, text: skill.body });
        started.push(skill.id);
      } catch (err) {
        if (err instanceof ConflictError) skipped.push(skill.id);
        else throw err;
      }
    }

    void (async () => {
      for (const item of queue) {
        try {
          await this.executeSuite(
            item.run,
            item.cases,
            () => this.skillPlan(choice.provider, choice.model, item.text),
            true,
          );
        } catch (err) {
          this.log?.error({ err, runId: item.run.id }, 'skill eval run crashed');
        }
      }
    })();

    return { started, skipped };
  }

  /** Boot reaper (next to `reapStaleRuns`): suite runs left `running` by a dead process. */
  async reapStaleSuiteRuns(): Promise<number> {
    return this.repo.failRunningSuiteRuns(INTERRUPTED_REASON);
  }

  /** `GET /eval-suite-runs/:id` — progress + per-case results (incl. errored); agent or skill/draft shape. */
  async getSuiteRun(workspaceId: string, id: string): Promise<AnyEvalSuiteRunDetail> {
    const run = await this.repo.getSuiteRun(workspaceId, id);
    if (!run) throw new NotFoundError('Eval run not found');
    return run.ownerKind === 'skill' ? this.skillRunDetail(run) : this.agentRunDetail(run);
  }

  private async resultsDto(runId: string) {
    const results = await this.repo.resultsForSuiteRun(runId);
    return results.map((r) => ({ ...toEvalCaseRunDto(r.run), case_name: r.caseName }));
  }

  private async agentRunDetail(run: EvalSuiteRunRow): Promise<EvalSuiteRunDetail> {
    return { ...toEvalSuiteRunDto(run), results: await this.resultsDto(run.id) };
  }

  private async skillRunDetail(run: EvalSuiteRunRow): Promise<SkillEvalSuiteRunDetail> {
    return { ...toSkillSuiteRunDto(run), results: await this.resultsDto(run.id) };
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
        ? a.agentVersion! < b.agentVersion!
          ? [a, b]
          : [b, a]
        : a.startedAt <= b.startedAt
          ? [a, b]
          : [b, a];
    const oldDto = toEvalSuiteRunDto(older);
    const newDto = toEvalSuiteRunDto(newer);

    const [oldConfig, newConfig, prints] = await Promise.all([
      this.versionConfig(agentId, older.agentVersion!),
      this.versionConfig(agentId, newer.agentVersion!),
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
  // Skill history / compare / dashboard (SPEC-08)
  // ---------------------------------------------------------------------------

  /** `GET /skills/:id/eval-runs?range=` — non-draft runs in range, history, alert, latest draft. */
  async listSkillRuns(workspaceId: string, skillId: string, range: EvalRange): Promise<SkillEvalRuns> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const [runs, completed, counts, draft] = await Promise.all([
      this.repo.listSkillSuiteRuns(workspaceId, skillId, rangeStart(range, new Date())),
      this.repo.latestCompletedSkillSuiteRuns(workspaceId, skillId, EVAL_HISTORY_LIMIT),
      this.repo.caseCountsBySkill(workspaceId),
      this.repo.latestSkillDraftRun(workspaceId, skillId),
    ]);
    const history = completed.map(toSkillSuiteRunDto).reverse(); // oldest first
    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    return {
      runs: runs.map(toSkillSuiteRunDto),
      history,
      alert: buildRegressionAlert(latest, previous),
      cases_total: counts.get(skillId) ?? 0,
      latest_draft: draft ? await this.skillRunDetail(draft) : null,
    };
  }

  /** `GET /skills/:id/eval-runs/compare` — `old`/`new` ordered by skill version (then start time). */
  async compareSkillRuns(
    workspaceId: string,
    skillId: string,
    baseId: string,
    headId: string,
  ): Promise<SkillEvalCompare> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const [a, b] = await Promise.all([
      this.repo.getSuiteRun(workspaceId, baseId),
      this.repo.getSuiteRun(workspaceId, headId),
    ]);
    if (!a || !b) throw new NotFoundError('Eval run not found');
    if (a.skillId !== skillId || b.skillId !== skillId) {
      throw new AppError('skill_mismatch', 'Both runs must belong to this skill.', 400);
    }
    if (a.isDraft || b.isDraft) {
      throw new AppError('draft_run_not_comparable', 'Draft runs cannot be compared.', 400);
    }

    const [older, newer] = orderRunsForCompare(a, b);
    const oldDto = toSkillSuiteRunDto(older);
    const newDto = toSkillSuiteRunDto(newer);

    const [versions, prints] = await Promise.all([
      this.container.skillsRepo.listVersions(skillId),
      this.repo.fingerprintsForSuiteRuns([older.id, newer.id]),
    ]);
    const textOf = (v: number | null) => versions.find((x) => x.version === v)?.body ?? null;
    const forRun = (id: string) =>
      prints.filter((p) => p.suiteRunId === id).map((p) => ({ caseId: p.caseId, fingerprint: p.fingerprint }));
    const flags = compareCaseFlags(forRun(older.id), forRun(newer.id));

    return {
      old: { run: oldDto, skill_text: textOf(older.skillVersion) },
      new: { run: newDto, skill_text: textOf(newer.skillVersion) },
      deltas: {
        ...metricDeltas(newDto, oldDto),
        cost_usd:
          newDto.cost_usd == null || oldDto.cost_usd == null ? null : newDto.cost_usd - oldDto.cost_usd,
      },
      model_changed: oldDto.provider !== newDto.provider || oldDto.model !== newDto.model,
      ...flags,
    };
  }

  /** `GET /eval-dashboard/skills` — every skill (incl. no-case ones) with latest run, history, running state. */
  async skillDashboard(workspaceId: string): Promise<EvalCrossSkillDashboard> {
    const [skills, counts, completed, running, recent] = await Promise.all([
      this.container.skillsRepo.list(workspaceId),
      this.repo.caseCountsBySkill(workspaceId),
      this.repo.completedSkillRunsForWorkspace(workspaceId, DASHBOARD_HISTORY_SCAN_LIMIT),
      this.repo.runningSkillRuns(workspaceId),
      this.repo.recentSkillRunsForWorkspace(workspaceId, DASHBOARD_RECENT_RUNS_LIMIT),
    ]);
    // Draft runs never surface here (AC-17); `running_run` is the non-draft one.
    const runningBySkill = new Map(running.filter((r) => !r.isDraft).map((r) => [r.skillId, r]));

    return {
      skills: skills.map((skill) => {
        // `completed` is newest first; keep the newest N then flip to chronological.
        const own = completed.filter((r) => r.skillId === skill.id).slice(0, EVAL_HISTORY_LIMIT);
        const latest = own[0];
        const runningRun = runningBySkill.get(skill.id);
        return {
          skill_id: skill.id,
          skill_name: skill.name,
          enabled: skill.enabled,
          scan_status: skill.scanStatus as SkillScanStatus,
          cases_total: counts.get(skill.id) ?? 0,
          latest_run: latest ? toSkillSuiteRunDto(latest) : null,
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
      recent_runs: recent.map((r) => ({ ...toSkillSuiteRunDto(r.run), skill_name: r.skillName })),
    };
  }
}

/** Suite-run row -> DTO for either owner kind (both carry the same metric fields). */
function toSuiteDto(row: EvalSuiteRunRow) {
  return row.ownerKind === 'skill' ? toSkillSuiteRunDto(row) : toEvalSuiteRunDto(row);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
