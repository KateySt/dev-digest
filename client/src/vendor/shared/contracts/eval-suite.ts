import { z } from 'zod';
import { EvalCaseRun, AgentVersionConfig, SkillScanStatus } from './knowledge.js';

/**
 * Versioned eval "suite runs" (SPEC-02): one row per agent run over its whole
 * case set, tied to an `agent_versions` snapshot. Per-case results are
 * `EvalCaseRun` rows linked via `suite_run_id`. All metrics are 0..1 or null
 * (null = zero denominator / nothing evaluated).
 */

export const EvalSuiteRunStatus = z.enum(['running', 'completed', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalMetricName = z.enum(['recall', 'precision', 'citation_accuracy']);
export type EvalMetricName = z.infer<typeof EvalMetricName>;

/** Fields shared by agent and skill suite runs (status, progress, pooled metrics). */
export const EvalSuiteRunBase = z.object({
  id: z.string(),
  status: EvalSuiteRunStatus,
  failure_reason: z.string().nullish(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  /** Cases that passed / were evaluated (non-errored) / errored. */
  passed_count: z.number().int(),
  evaluated_count: z.number().int(),
  errored_count: z.number().int(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalSuiteRunBase = z.infer<typeof EvalSuiteRunBase>;

export const EvalSuiteRun = EvalSuiteRunBase.extend({
  /** Discriminator vs. skill runs; the server always sets it. `.nullish()` — older payloads omit it. */
  owner_kind: z.literal('agent').nullish(),
  agent_id: z.string(),
  agent_version: z.number().int(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

/** A skill suite run or draft run. `skill_version` is null for drafts. */
export const SkillEvalSuiteRun = EvalSuiteRunBase.extend({
  owner_kind: z.literal('skill'),
  skill_id: z.string(),
  skill_version: z.number().int().nullable(),
  is_draft: z.boolean(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
});
export type SkillEvalSuiteRun = z.infer<typeof SkillEvalSuiteRun>;

/** Per-case result inside a suite run, with the case's name for display. */
export const EvalSuiteCaseResult = EvalCaseRun.extend({ case_name: z.string().nullish() });
export type EvalSuiteCaseResult = z.infer<typeof EvalSuiteCaseResult>;

/** `GET /eval-suite-runs/:id` — progress + per-case results (incl. errored). */
export const EvalSuiteRunDetail = EvalSuiteRun.extend({
  results: z.array(EvalSuiteCaseResult),
});
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

/** Regression alert: structured fields + a fixed-template English `message`. */
export const EvalRegressionAlert = z.object({
  version: z.number().int(),
  previous_version: z.number().int(),
  /** Metrics that dropped by >= 1 point, with the drop in percentage points. */
  drops: z.array(z.object({ metric: EvalMetricName, points: z.number() })),
  /** Direction of every other metric vs. the previous completed run. */
  others: z.array(z.object({ metric: EvalMetricName, direction: z.enum(['up', 'down', 'flat']) })),
  message: z.string(),
  /** Set when the two runs used a different provider/model (message carries the suffix). `.nullish()` — agent alerts omit it. */
  model_changed: z.boolean().nullish(),
});
export type EvalRegressionAlert = z.infer<typeof EvalRegressionAlert>;

/** `GET /agents/:id/eval-runs?range=` */
export const EvalRange = z.enum(['7d', '30d', '90d', 'all']);
export type EvalRange = z.infer<typeof EvalRange>;

export const AgentEvalRuns = z.object({
  /** Runs started within the range, newest first (any status). */
  runs: z.array(EvalSuiteRun),
  /** Latest completed runs regardless of range, oldest first — metric cards + sparklines. */
  history: z.array(EvalSuiteRun),
  alert: EvalRegressionAlert.nullable(),
  /** Current number of eval cases the agent owns. */
  cases_total: z.number().int(),
});
export type AgentEvalRuns = z.infer<typeof AgentEvalRuns>;

/** One side of a compare: the run and the agent config of its version. */
export const EvalCompareSide = z.object({
  run: EvalSuiteRun,
  /** null when the version has no recorded snapshot. */
  config: AgentVersionConfig.nullable(),
});
export type EvalCompareSide = z.infer<typeof EvalCompareSide>;

/** `GET /agents/:id/eval-runs/compare?base=&head=` — `old`/`new` ordered by version. */
export const EvalCompare = z.object({
  old: EvalCompareSide,
  new: EvalCompareSide,
  /** new minus old; null when either side is null. */
  deltas: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    cost_usd: z.number().nullable(),
  }),
  /** Set when the two runs executed different case-id sets. */
  case_sets_differ: z
    .object({ old_count: z.number().int(), new_count: z.number().int() })
    .nullable(),
  /** Cases executed in both runs whose input fingerprint changed. */
  edited_cases: z.number().int(),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** `GET /agents/:id/eval-stats` (also returned for skills; deltas/pass null there). */
export const AgentEvalStats = z.object({
  cases_total: z.number().int(),
  /** Cases that have at least one result. */
  cases_evaluated: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  /** Deltas vs. the previous completed suite run (null = no basis). */
  delta: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
  }),
  traces_passed: z.number().int().nullable(),
  traces_evaluated: z.number().int().nullable(),
  /** Latest completed suite run, if any. */
  latest_run: EvalSuiteRun.nullable(),
  /** Skill owners only: latest completed non-draft skill run. `.nullish()` — absent for agents. */
  latest_skill_run: SkillEvalSuiteRun.nullish(),
  /** Each case's latest result from any run. */
  case_results: z.array(EvalCaseRun),
});
export type AgentEvalStats = z.infer<typeof AgentEvalStats>;

/** A suite run row on the cross-agent dashboard. */
export const EvalDashboardRun = EvalSuiteRun.extend({ agent_name: z.string() });
export type EvalDashboardRun = z.infer<typeof EvalDashboardRun>;

export const EvalDashboardAgent = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  cases_total: z.number().int(),
  /** Latest completed suite run, or null when never run. */
  latest_run: EvalSuiteRun.nullable(),
  /** Short chronological metric history for the sparkline. */
  history: z.array(
    z.object({
      recall: z.number().nullable(),
      precision: z.number().nullable(),
      citation_accuracy: z.number().nullable(),
    }),
  ),
  running_run: z
    .object({ id: z.string(), cases_done: z.number().int(), cases_total: z.number().int() })
    .nullable(),
});
export type EvalDashboardAgent = z.infer<typeof EvalDashboardAgent>;

export const EvalCrossAgentDashboard = z.object({
  agents: z.array(EvalDashboardAgent),
  recent_runs: z.array(EvalDashboardRun),
});
export type EvalCrossAgentDashboard = z.infer<typeof EvalCrossAgentDashboard>;

/** `POST /agents/:id/eval-runs` -> 202 */
export const StartEvalRunResponse = z.object({
  run_id: z.string(),
  status: z.literal('running'),
  cases_total: z.number().int(),
});
export type StartEvalRunResponse = z.infer<typeof StartEvalRunResponse>;

/** `POST /eval-dashboard/run-all` -> 202 */
export const RunAllAgentsResponse = z.object({
  started: z.array(z.string()),
  skipped: z.array(z.string()),
});
export type RunAllAgentsResponse = z.infer<typeof RunAllAgentsResponse>;

/** `POST /findings/:id/eval-case` 409 body. */
export const EvalCaseConflict = z.object({ case_id: z.string() });
export type EvalCaseConflict = z.infer<typeof EvalCaseConflict>;

// ---------------------------------------------------------------------------
// Skill suite runs (SPEC-08)
// ---------------------------------------------------------------------------

export const SkillEvalSuiteRunDetail = SkillEvalSuiteRun.extend({
  results: z.array(EvalSuiteCaseResult),
});
export type SkillEvalSuiteRunDetail = z.infer<typeof SkillEvalSuiteRunDetail>;

/** `GET /eval-suite-runs/:id` — discriminated by `owner_kind` ('skill' | 'agent'). */
export const AnyEvalSuiteRunDetail = z.union([SkillEvalSuiteRunDetail, EvalSuiteRunDetail]);
export type AnyEvalSuiteRunDetail = z.infer<typeof AnyEvalSuiteRunDetail>;

/** `POST /skills/:id/eval-runs` body. */
export const StartSkillEvalRunBody = z.object({ draft_body: z.string().max(50_000).optional() });
export type StartSkillEvalRunBody = z.infer<typeof StartSkillEvalRunBody>;

/** `POST /skills/:id/eval-runs` -> 202 */
export const StartSkillEvalRunResponse = z.object({
  run_id: z.string(),
  status: z.literal('running'),
  cases_total: z.number().int(),
  is_draft: z.boolean(),
});
export type StartSkillEvalRunResponse = z.infer<typeof StartSkillEvalRunResponse>;

/** `GET /skills/:id/eval-runs?range=` */
export const SkillEvalRuns = z.object({
  /** Non-draft runs started within the range, newest first. */
  runs: z.array(SkillEvalSuiteRun),
  /** Latest completed non-draft runs regardless of range, oldest first. */
  history: z.array(SkillEvalSuiteRun),
  alert: EvalRegressionAlert.nullable(),
  cases_total: z.number().int(),
  /** The skill's single draft run (with per-case results), or null. */
  latest_draft: SkillEvalSuiteRunDetail.nullable(),
});
export type SkillEvalRuns = z.infer<typeof SkillEvalRuns>;

export const SkillEvalCompareSide = z.object({
  run: SkillEvalSuiteRun,
  /** Skill text of that run's version; null when the version snapshot is missing. */
  skill_text: z.string().nullable(),
});
export type SkillEvalCompareSide = z.infer<typeof SkillEvalCompareSide>;

/** `GET /skills/:id/eval-runs/compare?base=&head=` — `old`/`new` ordered by skill version. */
export const SkillEvalCompare = z.object({
  old: SkillEvalCompareSide,
  new: SkillEvalCompareSide,
  /** new minus old; null when either side is null. */
  deltas: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    cost_usd: z.number().nullable(),
  }),
  /** True when provider or model differ between the two runs. */
  model_changed: z.boolean(),
  case_sets_differ: z
    .object({ old_count: z.number().int(), new_count: z.number().int() })
    .nullable(),
  edited_cases: z.number().int(),
});
export type SkillEvalCompare = z.infer<typeof SkillEvalCompare>;

/** A suite run row on the cross-skill dashboard. */
export const SkillEvalDashboardRun = SkillEvalSuiteRun.extend({ skill_name: z.string() });
export type SkillEvalDashboardRun = z.infer<typeof SkillEvalDashboardRun>;

export const EvalDashboardSkill = z.object({
  skill_id: z.string(),
  skill_name: z.string(),
  enabled: z.boolean(),
  scan_status: SkillScanStatus,
  cases_total: z.number().int(),
  latest_run: SkillEvalSuiteRun.nullable(),
  /** Last <=10 completed non-draft runs, chronological. */
  history: z.array(
    z.object({
      recall: z.number().nullable(),
      precision: z.number().nullable(),
      citation_accuracy: z.number().nullable(),
    }),
  ),
  /** Non-draft running run only. */
  running_run: z
    .object({ id: z.string(), cases_done: z.number().int(), cases_total: z.number().int() })
    .nullable(),
});
export type EvalDashboardSkill = z.infer<typeof EvalDashboardSkill>;

export const EvalCrossSkillDashboard = z.object({
  skills: z.array(EvalDashboardSkill),
  recent_runs: z.array(SkillEvalDashboardRun),
});
export type EvalCrossSkillDashboard = z.infer<typeof EvalCrossSkillDashboard>;

/** `POST /eval-dashboard/skills/run-all` -> 202 */
export const RunAllSkillsResponse = z.object({
  started: z.array(z.string()),
  skipped: z.array(z.string()),
});
export type RunAllSkillsResponse = z.infer<typeof RunAllSkillsResponse>;

/** Target of "Turn into eval case": the finding's agent or a skill linked to it. */
export const EvalCaseTarget = z.object({
  kind: z.enum(['agent', 'skill']),
  id: z.string(),
});
export type EvalCaseTarget = z.infer<typeof EvalCaseTarget>;

/** `POST /findings/:id/eval-case` body. */
export const CreateEvalCaseFromFindingBody = z.object({ target: EvalCaseTarget.optional() });
export type CreateEvalCaseFromFindingBody = z.infer<typeof CreateEvalCaseFromFindingBody>;
