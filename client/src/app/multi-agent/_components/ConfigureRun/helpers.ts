import type { AgentEstimate } from "@devdigest/shared";
import { CLOSED_PR_STATUSES } from "./constants";

export interface EstimateTotal {
  /** Queue-aware wall-clock estimate; null when no checked agent has a duration. */
  durationMs: number | null;
  /** Sum of known costs; null when no checked agent has a cost. */
  costUsd: number | null;
  /** Checked agents missing a duration or a cost estimate. */
  incompleteCount: number;
}

/**
 * Greedy queue simulation: durations sorted descending, each assigned to the
 * slot that frees earliest, result = latest slot end. Missing values are left
 * out, never treated as 0.
 */
export function estimateTotal(estimates: AgentEstimate[], concurrency: number): EstimateTotal {
  const slots = Math.max(1, Math.floor(concurrency) || 1);
  const durations = estimates
    .map((e) => e.mean_duration_ms)
    .filter((d): d is number => d != null)
    .sort((a, b) => b - a);
  const free = new Array<number>(slots).fill(0);
  for (const d of durations) {
    let i = 0;
    for (let k = 1; k < free.length; k++) if (free[k]! < free[i]!) i = k;
    free[i] = free[i]! + d;
  }
  const costs = estimates.map((e) => e.mean_cost_usd).filter((c): c is number => c != null);
  return {
    durationMs: durations.length ? Math.max(...free) : null,
    costUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    incompleteCount: estimates.filter((e) => e.mean_duration_ms == null || e.mean_cost_usd == null).length,
  };
}

export const formatCost = (usd: number | null): string =>
  usd == null ? "—" : `$${usd.toFixed(usd > 0 && usd < 0.01 ? 3 : 2)}`;

export const isOpenPr = (status: string): boolean => !CLOSED_PR_STATUSES.includes(status);

/** In-flight multi-run id carried by a 409 `review_in_progress` error, if any. */
export function inFlightMultiRunId(details: unknown): string | null {
  const id = (details as { multi_agent_run_id?: unknown } | null | undefined)?.multi_agent_run_id;
  return typeof id === "string" && id ? id : null;
}
