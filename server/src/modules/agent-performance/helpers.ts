import type { AgentPerfRow, AgentStats, PerfCostSegment, RunSummary, StatPoint } from '@devdigest/shared';
import type { AgentRunRow, AgentRow } from '../../db/rows.js';
import type { FindingOutcomeRow } from './repository.js';
import { TREND_RUN_LIMIT } from './constants.js';

/**
 * Pure aggregation math for the agent-performance module — no I/O, so every
 * rule (the accept-rate formula, what counts toward an average) is
 * unit-testable without a database. `repository.ts` fetches rows; this file
 * turns them into the shared `AgentStats`/`AgentPerf` contract shapes.
 */

/** The numeric core shared by `AgentStats` and `AgentPerfRow` — everything
 *  except identity fields (agent id/name/provider/model) and the trend, which
 *  differ in shape between the two DTOs. */
export interface PerfAggregate {
  runs: number;
  findings_total: number;
  accepted: number;
  dismissed: number;
  pending: number;
  accept_rate: number | null;
  dismiss_rate: number | null;
  avg_findings_per_run: number | null;
  total_cost_usd: number | null;
  avg_cost_usd: number | null;
  avg_latency_ms: number | null;
  findings_by_severity: { CRITICAL: number; WARNING: number; SUGGESTION: number };
}

/** Average of the non-null values, or null when there are none. */
function avgOf(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0) return null;
  return known.reduce((a, b) => a + b, 0) / known.length;
}

function sumOf(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  if (known.length === 0) return null;
  return known.reduce((a, b) => a + b, 0);
}

/** Aggregate one agent's runs + finding outcomes into the numeric core shared
 *  by `AgentStats` and `AgentPerfRow`. `accept_rate`/`dismiss_rate` are over
 *  ACTED findings only — pending (neither accepted nor dismissed) findings
 *  are excluded from the denominator, matching the contract's own doc comment. */
export function computeAggregate(runs: AgentRunRow[], findings: FindingOutcomeRow[]): PerfAggregate {
  const accepted = findings.filter((f) => f.acceptedAt != null).length;
  const dismissed = findings.filter((f) => f.dismissedAt != null).length;
  const pending = findings.length - accepted - dismissed;
  const acted = accepted + dismissed;

  const bySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL' || f.severity === 'WARNING' || f.severity === 'SUGGESTION') {
      bySeverity[f.severity]++;
    }
  }

  return {
    runs: runs.length,
    findings_total: findings.length,
    accepted,
    dismissed,
    pending,
    accept_rate: acted > 0 ? accepted / acted : null,
    dismiss_rate: acted > 0 ? dismissed / acted : null,
    avg_findings_per_run: runs.length > 0 ? findings.length / runs.length : null,
    total_cost_usd: sumOf(runs.map((r) => r.costUsd)),
    avg_cost_usd: avgOf(runs.map((r) => r.costUsd)),
    avg_latency_ms: avgOf(runs.map((r) => r.durationMs)),
    findings_by_severity: bySeverity,
  };
}

/** Last `TREND_RUN_LIMIT` runs (oldest→newest) as findings-per-run points. */
function trendPoints(runs: AgentRunRow[]): StatPoint[] {
  return [...runs]
    .sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime())
    .slice(-TREND_RUN_LIMIT)
    .map((r) => ({ label: r.ranAt.toISOString(), value: r.findingsCount ?? 0 }));
}

/** Same trend, as plain numbers (AgentPerfRow's sparkline shape). */
function trendNumbers(runs: AgentRunRow[]): number[] {
  return trendPoints(runs).map((p) => p.value);
}

export function toAgentStats(agentId: string, agentName: string, runs: AgentRunRow[], findings: FindingOutcomeRow[]): AgentStats {
  return {
    agent_id: agentId,
    agent_name: agentName,
    ...computeAggregate(runs, findings),
    trend: trendPoints(runs),
  };
}

export function toAgentPerfRow(agent: AgentRow, runs: AgentRunRow[], findings: FindingOutcomeRow[]): AgentPerfRow {
  const lastRun = runs.length > 0 ? runs.reduce((a, b) => (a.ranAt > b.ranAt ? a : b)) : undefined;
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    provider: agent.provider,
    model: agent.model,
    ...computeAggregate(runs, findings),
    last_run_at: lastRun ? lastRun.ranAt.toISOString() : null,
    trend: trendNumbers(runs),
  };
}

/** Group `{ label, value }` pairs by label, summing values, sorted descending
 *  (largest segment first) — the shape both `Donut` and `PerfCostSegment`
 *  already share. */
export function costSegments(rows: { label: string; value: number }[]): PerfCostSegment[] {
  const byLabel = new Map<string, number>();
  for (const r of rows) byLabel.set(r.label, (byLabel.get(r.label) ?? 0) + r.value);
  return [...byLabel.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function toRunSummary(row: {
  run: AgentRunRow;
  agentName: string | null;
  prNumber: number | null;
}): RunSummary {
  const { run, agentName, prNumber } = row;
  return {
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: agentName ?? null,
    pr_number: prNumber,
    provider: run.provider,
    model: run.model,
    status: run.status,
    error: run.error,
    duration_ms: run.durationMs,
    tokens_in: run.tokensIn,
    tokens_out: run.tokensOut,
    cost_usd: run.costUsd,
    findings_count: run.findingsCount,
    grounding: run.grounding,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    score: run.score,
    blockers: run.blockers,
  };
}
