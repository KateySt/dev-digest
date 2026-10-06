import { z } from 'zod';
import { EvalCaseRun, AgentVersionConfig } from './knowledge.js';

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

export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
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
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

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
