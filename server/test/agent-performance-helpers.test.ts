import { describe, it, expect } from 'vitest';
import {
  computeAggregate,
  costSegments,
  toAgentPerfRow,
  toAgentStats,
  toRunSummary,
} from '../src/modules/agent-performance/helpers.js';
import type { AgentRunRow, AgentRow } from '../src/db/rows.js';
import type { FindingOutcomeRow } from '../src/modules/agent-performance/repository.js';

function run(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    id: 'run-1',
    workspaceId: 'ws1',
    agentId: 'ag1',
    prId: 'pr1',
    ranAt: new Date('2026-06-01T00:00:00Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    durationMs: 1000,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.01,
    status: 'done',
    error: null,
    source: 'local',
    findingsCount: 1,
    grounding: '1/1 passed',
    score: 90,
    blockers: 0,
    ...overrides,
  };
}

function finding(overrides: Partial<FindingOutcomeRow> = {}): FindingOutcomeRow {
  return {
    agentId: 'ag1',
    severity: 'WARNING',
    acceptedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe('computeAggregate', () => {
  it('accept_rate/dismiss_rate are over ACTED findings only — pending is excluded', () => {
    const findings = [
      finding({ acceptedAt: new Date() }),
      finding({ acceptedAt: new Date() }),
      finding({ dismissedAt: new Date() }),
      finding(), // pending — neither accepted nor dismissed
    ];
    const agg = computeAggregate([run()], findings);
    expect(agg.accepted).toBe(2);
    expect(agg.dismissed).toBe(1);
    expect(agg.pending).toBe(1);
    // 2 accepted / (2 accepted + 1 dismissed) = 2/3, NOT 2/4.
    expect(agg.accept_rate).toBeCloseTo(2 / 3, 10);
    expect(agg.dismiss_rate).toBeCloseTo(1 / 3, 10);
  });

  it('accept_rate/dismiss_rate are null when no finding has been acted on', () => {
    const agg = computeAggregate([run()], [finding(), finding()]);
    expect(agg.accept_rate).toBeNull();
    expect(agg.dismiss_rate).toBeNull();
  });

  it('avg_cost_usd / avg_latency_ms average only over non-null values, not all runs', () => {
    const runs = [
      run({ costUsd: 0.02, durationMs: 2000 }),
      run({ costUsd: null, durationMs: 4000 }), // e.g. a failed run — no cost, but duration is real
      run({ costUsd: 0.04, durationMs: null }),
    ];
    const agg = computeAggregate(runs, []);
    // (0.02 + 0.04) / 2 priced runs, NOT / 3.
    expect(agg.avg_cost_usd).toBeCloseTo(0.03, 10);
    expect(agg.total_cost_usd).toBeCloseTo(0.06, 10);
    // (2000 + 4000) / 2 timed runs, NOT / 3.
    expect(agg.avg_latency_ms).toBeCloseTo(3000, 10);
  });

  it('total_cost_usd / avg_cost_usd / avg_latency_ms are null when every run lacks the field', () => {
    const agg = computeAggregate([run({ costUsd: null, durationMs: null })], []);
    expect(agg.total_cost_usd).toBeNull();
    expect(agg.avg_cost_usd).toBeNull();
    expect(agg.avg_latency_ms).toBeNull();
  });

  it('avg_findings_per_run is findings/runs, or null with zero runs', () => {
    expect(computeAggregate([run(), run()], [finding(), finding(), finding()]).avg_findings_per_run).toBeCloseTo(1.5, 10);
    expect(computeAggregate([], []).avg_findings_per_run).toBeNull();
  });

  it('findings_by_severity counts each of the three known severities, ignores unknown ones', () => {
    const findings = [
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'WARNING' }),
      finding({ severity: 'SUGGESTION' }),
      finding({ severity: 'not-a-real-severity' }),
    ];
    const agg = computeAggregate([run()], findings);
    expect(agg.findings_by_severity).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    // the unknown-severity row is dropped from the bucket but still counts
    // toward findings_total (it's a real persisted finding either way).
    expect(agg.findings_total).toBe(5);
  });

  it('runs is a plain count, including failed/cancelled ones', () => {
    const agg = computeAggregate([run({ status: 'done' }), run({ status: 'failed' }), run({ status: 'cancelled' })], []);
    expect(agg.runs).toBe(3);
  });
});

describe('toAgentStats / toAgentPerfRow', () => {
  it('trend keeps only the last TREND_RUN_LIMIT runs, oldest→newest, as findings-per-run points', () => {
    const runs = Array.from({ length: 15 }, (_, i) =>
      run({ id: `run-${i}`, ranAt: new Date(2026, 0, i + 1), findingsCount: i }),
    );
    const stats = toAgentStats('ag1', 'Security Reviewer', runs, []);
    expect(stats.trend).toHaveLength(10);
    expect(stats.trend[0]!.value).toBe(5); // the 6th run (index 5), oldest kept
    expect(stats.trend[9]!.value).toBe(14); // the last run, newest
  });

  it('toAgentPerfRow sets last_run_at to the most recent run, or null with no runs', () => {
    const runs = [run({ ranAt: new Date('2026-06-01T00:00:00Z') }), run({ ranAt: new Date('2026-06-05T00:00:00Z') })];
    const agent: AgentRow = {
      id: 'ag1',
      workspaceId: 'ws1',
      name: 'Security Reviewer',
      description: '',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: 'x',
      outputSchema: null,
      strategy: 'single-pass',
      ciFailOn: 'critical',
      repoIntel: true,
      enabled: true,
      version: 1,
      createdBy: null,
      createdAt: new Date(),
    };
    const row = toAgentPerfRow(agent, runs, []);
    expect(row.last_run_at).toBe('2026-06-05T00:00:00.000Z');
    expect(toAgentPerfRow(agent, [], []).last_run_at).toBeNull();
  });
});

describe('costSegments', () => {
  it('groups by label, sums values, and sorts descending', () => {
    const segments = costSegments([
      { label: 'gpt-4.1', value: 0.02 },
      { label: 'deepseek', value: 0.09 },
      { label: 'gpt-4.1', value: 0.03 },
    ]);
    expect(segments).toEqual([
      { label: 'deepseek', value: 0.09 },
      { label: 'gpt-4.1', value: 0.05 },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(costSegments([])).toEqual([]);
  });
});

describe('toRunSummary', () => {
  it('maps a joined row to the RunSummary DTO, including pr_number', () => {
    const summary = toRunSummary({ run: run(), agentName: 'Security Reviewer', prNumber: 483 });
    expect(summary.run_id).toBe('run-1');
    expect(summary.pr_number).toBe(483);
    expect(summary.agent_name).toBe('Security Reviewer');
    expect(summary.ran_at).toBe('2026-06-01T00:00:00.000Z');
  });

  it('is null-safe for agentName/prNumber', () => {
    const summary = toRunSummary({ run: run(), agentName: null, prNumber: null });
    expect(summary.agent_name).toBeNull();
    expect(summary.pr_number).toBeNull();
  });
});
