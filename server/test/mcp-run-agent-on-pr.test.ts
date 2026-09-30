import { describe, it, expect, vi } from 'vitest';
import type { ReviewDto } from '../src/modules/reviews/helpers.js';
import type { RunSummary } from '@devdigest/shared';
import { buildRunAgentOnPrHandler } from '../src/modules/mcp/tools/run-agent-on-pr.js';
import { AppError, NotFoundError, ConfigError } from '../src/platform/errors.js';

/**
 * Controllable fake RunBus. `immediate: true` mirrors RunBus.onDone's real
 * "already complete" fast path (fires via queueMicrotask); `immediate: false`
 * never fires, so tests can drive the timeout branch deterministically with
 * fake timers instead of real sleeps.
 */
class FakeRunBus {
  constructor(private immediate: boolean) {}
  onDone(_runId: string, listener: () => void): () => void {
    if (this.immediate) queueMicrotask(listener);
    return () => undefined;
  }
}

function review(overrides: Partial<ReviewDto> = {}): ReviewDto {
  return {
    id: 'r1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Reviewer',
    kind: 'review',
    verdict: 'approve',
    summary: 'Looks good.',
    score: 95,
    model: 'claude-sonnet',
    created_at: '2026-01-01T00:00:00.000Z',
    findings: [],
    ...overrides,
  };
}

function runSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Reviewer',
    pr_number: 1,
    provider: 'anthropic',
    model: 'claude-sonnet',
    status: 'done',
    error: null,
    duration_ms: 100,
    tokens_in: 10,
    tokens_out: 10,
    cost_usd: 0.01,
    findings_count: 0,
    grounding: '0/0 passed',
    ran_at: '2026-01-01T00:00:00.000Z',
    score: 95,
    blockers: 0,
    ...overrides,
  };
}

describe('run_agent_on_pr tool', () => {
  it('resolves targets, runs the review, waits for completion, and returns trimmed reviews', async () => {
    const resolveTargets = vi.fn().mockResolvedValue([{ id: 'agent-1', name: 'Reviewer' }]);
    const runReview = vi
      .fn()
      .mockResolvedValue({ runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer' }], reviews: [] });
    const reviewsForPull = vi.fn().mockResolvedValue([review()]);
    const listRuns = vi.fn();
    const handler = buildRunAgentOnPrHandler(
      { reviewService: { resolveTargets, runReview, reviewsForPull, listRuns }, runBus: new FakeRunBus(true) },
      'ws-1',
    );

    const result = await handler({ pr_id: 'pr-1', agent_id: 'agent-1' });

    expect(resolveTargets).toHaveBeenCalledWith('ws-1', { agentId: 'agent-1' });
    expect(runReview).toHaveBeenCalledWith('ws-1', 'pr-1', [{ id: 'agent-1', name: 'Reviewer' }]);
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toEqual([
      { run_id: 'run-1', agent_name: 'Reviewer', verdict: 'approve', score: 95, summary: 'Looks good.', findings: [] },
    ]);
  });

  it('passes {all: true} through to resolveTargets when given', async () => {
    const resolveTargets = vi.fn().mockResolvedValue([]);
    const runReview = vi.fn().mockResolvedValue({ runs: [], reviews: [] });
    const reviewsForPull = vi.fn().mockResolvedValue([]);
    const listRuns = vi.fn();
    const handler = buildRunAgentOnPrHandler(
      { reviewService: { resolveTargets, runReview, reviewsForPull, listRuns }, runBus: new FakeRunBus(true) },
      'ws-1',
    );

    await handler({ pr_id: 'pr-1', all: true });

    expect(resolveTargets).toHaveBeenCalledWith('ws-1', { all: true });
  });

  it('returns {status: "running", run_ids} on timeout instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      const resolveTargets = vi.fn().mockResolvedValue([{ id: 'agent-1', name: 'Reviewer' }]);
      const runReview = vi
        .fn()
        .mockResolvedValue({ runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer' }], reviews: [] });
      const reviewsForPull = vi.fn();
      const listRuns = vi.fn();
      const handler = buildRunAgentOnPrHandler(
        { reviewService: { resolveTargets, runReview, reviewsForPull, listRuns }, runBus: new FakeRunBus(false) },
        'ws-1',
      );

      const pending = handler({ pr_id: 'pr-1', agent_id: 'agent-1', wait_timeout_ms: 5_000 });
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await pending;

      expect(result.isError).toBeUndefined();
      expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
        status: 'running',
        run_ids: ['run-1'],
      });
      expect(reviewsForPull).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces a run that failed with a missing provider key instead of a silent empty result', async () => {
    const resolveTargets = vi.fn().mockResolvedValue([{ id: 'agent-1', name: 'Reviewer' }]);
    const runReview = vi
      .fn()
      .mockResolvedValue({ runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer' }], reviews: [] });
    // No review row: the run failed before an LLM call ever completed.
    const reviewsForPull = vi.fn().mockResolvedValue([]);
    const listRuns = vi.fn().mockResolvedValue([
      runSummary({ status: 'failed', error: 'ANTHROPIC_API_KEY is not configured' }),
    ]);
    const handler = buildRunAgentOnPrHandler(
      { reviewService: { resolveTargets, runReview, reviewsForPull, listRuns }, runBus: new FakeRunBus(true) },
      'ws-1',
    );

    const result = await handler({ pr_id: 'pr-1', agent_id: 'agent-1' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('ANTHROPIC_API_KEY is not configured');
  });

  it('maps a missing-agent NotFoundError to a "check list_agents" tool error', async () => {
    const resolveTargets = vi.fn().mockRejectedValue(new NotFoundError('Agent not found'));
    const handler = buildRunAgentOnPrHandler(
      {
        reviewService: { resolveTargets, runReview: vi.fn(), reviewsForPull: vi.fn(), listRuns: vi.fn() },
        runBus: new FakeRunBus(true),
      },
      'ws-1',
    );

    const result = await handler({ pr_id: 'pr-1', agent_id: 'does-not-exist' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('check list_agents');
  });

  it('maps missing pr with its own NotFoundError message (no "check list_agents" hint)', async () => {
    const resolveTargets = vi.fn().mockResolvedValue([{ id: 'agent-1', name: 'Reviewer' }]);
    const runReview = vi.fn().mockRejectedValue(new NotFoundError('Pull request not found'));
    const handler = buildRunAgentOnPrHandler(
      {
        reviewService: { resolveTargets, runReview, reviewsForPull: vi.fn(), listRuns: vi.fn() },
        runBus: new FakeRunBus(true),
      },
      'ws-1',
    );

    const result = await handler({ pr_id: 'missing', agent_id: 'agent-1' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toBe('Pull request not found');
    expect(text).not.toContain('list_agents');
  });

  it('surfaces AppError("Provide agentId or all:true") when neither agent_id nor all is given', async () => {
    const resolveTargets = vi
      .fn()
      .mockRejectedValue(new AppError('invalid_run_request', 'Provide agentId or all:true', 400));
    const handler = buildRunAgentOnPrHandler(
      {
        reviewService: { resolveTargets, runReview: vi.fn(), reviewsForPull: vi.fn(), listRuns: vi.fn() },
        runBus: new FakeRunBus(true),
      },
      'ws-1',
    );

    const result = await handler({ pr_id: 'pr-1' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe('Provide agentId or all:true');
  });

  it('surfaces a ConfigError thrown synchronously (defensive — not the normal path)', async () => {
    const resolveTargets = vi.fn().mockRejectedValue(new ConfigError('ANTHROPIC_API_KEY is not configured'));
    const handler = buildRunAgentOnPrHandler(
      {
        reviewService: { resolveTargets, runReview: vi.fn(), reviewsForPull: vi.fn(), listRuns: vi.fn() },
        runBus: new FakeRunBus(true),
      },
      'ws-1',
    );

    const result = await handler({ pr_id: 'pr-1', agent_id: 'agent-1' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('ANTHROPIC_API_KEY is not configured');
  });

  it('short-circuits waitForAllDone when there are zero run ids (all:true, no enabled agents)', async () => {
    const resolveTargets = vi.fn().mockResolvedValue([]);
    const runReview = vi.fn().mockResolvedValue({ runs: [], reviews: [] });
    const reviewsForPull = vi.fn().mockResolvedValue([]);
    const listRuns = vi.fn();
    const handler = buildRunAgentOnPrHandler(
      { reviewService: { resolveTargets, runReview, reviewsForPull, listRuns }, runBus: new FakeRunBus(false) },
      'ws-1',
    );

    const result = await handler({ pr_id: 'pr-1', all: true });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual([]);
  });
});
