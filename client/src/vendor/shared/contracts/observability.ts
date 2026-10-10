import { z } from 'zod';
import { Severity } from './findings';
import { FindingRecord } from './review-api';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /multi-agent-runs/:id
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - DisagreementRow / ConflictTake  where agents disagree on a finding group
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review (SPEC-10)
// ---------------------------------------------------------------------------

/** Lifecycle of one agent's run inside a multi-agent run. */
export const AgentColumnStatus = z.enum(['queued', 'running', 'done', 'failed', 'cancelled']);
export type AgentColumnStatus = z.infer<typeof AgentColumnStatus>;

/**
 * One agent's result column. Fields not yet known are null (never 0).
 * Findings reuse the persisted `FindingRecord` shape so the shared FindingCard
 * renders them without an adapter.
 */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: AgentColumnStatus,
  /** 1-based queue position while `queued` (1 = starts next); null otherwise. */
  queue_position: z.number().int().nullable(),
  /** Failure message when `failed`; null otherwise. */
  error: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  /** ISO time the run actually started (left the queue); null/absent while queued. */
  started_at: z.string().nullish(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(FindingRecord),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One finding inside a group, with its owning agent; no field is rewritten. */
export const GroupMember = z.object({
  finding_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  severity: Severity,
  confidence: z.number(),
  title: z.string(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type GroupMember = z.infer<typeof GroupMember>;

/** Findings of different agents judged to be about the same issue. At most one member per agent. */
export const FindingGroup = z.object({
  id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  /** The representative member's finding id (highest severity, then confidence...). */
  representative_id: z.string(),
  members: z.array(GroupMember),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** One selected agent's stance on a group. No generated reason text. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  /** Member severity if flagged; `not_flagged` only for a `done` run with no member. */
  verdict: z.union([Severity, z.enum(['not_flagged', 'failed', 'cancelled', 'pending'])]),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/** One row of the disagreement block: one per group, one take per selected agent. */
export const DisagreementRow = z.object({
  group_id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
  /** True when a `done` agent did not flag it, or flagging severities differ. */
  is_conflict: z.boolean(),
});
export type DisagreementRow = z.infer<typeof DisagreementRow>;

/** Back-compat alias for the pre-SPEC-10 name. */
export const Conflict = DisagreementRow;
export type Conflict = DisagreementRow;

/** Response of GET /multi-agent-runs/:id (and the POST /pulls/:id/review multi path's results). */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullish(),
  repo_id: z.string().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  /** True while any agent is queued or running. */
  in_progress: z.boolean().nullish(),
  /** True while totals are still partial (same condition as in_progress). */
  totals_partial: z.boolean().nullish(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  groups: z.array(FindingGroup).nullish(),
  conflicts: z.array(DisagreementRow),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** One entry of GET /multi-agent-runs?pr_id=&limit= (newest first). */
export const MultiAgentRunSummary = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullish(),
  repo_id: z.string().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  /** Overall status derived from the children. */
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
});
export type MultiAgentRunSummary = z.infer<typeof MultiAgentRunSummary>;

/** Per-agent estimate over the last 10 done runs; null (never 0) when no history. */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  mean_duration_ms: z.number().nullable(),
  mean_cost_usd: z.number().nullable(),
  sample_size: z.number().int(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

/** Response of GET /multi-agent-runs/estimates. */
export const AgentEstimates = z.object({
  review_concurrency: z.number().int(),
  agents: z.array(AgentEstimate),
});
export type AgentEstimates = z.infer<typeof AgentEstimates>;

/** Response of POST /multi-agent-runs/:id/cancel. */
export const MultiAgentCancelResponse = z.object({
  cancelled_run_ids: z.array(z.string()),
});
export type MultiAgentCancelResponse = z.infer<typeof MultiAgentCancelResponse>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
