import { describe, it, expect, vi } from 'vitest';
import type { ReviewDto } from '../src/modules/reviews/helpers.js';
import { buildGetFindingsHandler } from '../src/modules/mcp/tools/get-findings.js';

function review(overrides: Partial<ReviewDto> = {}): ReviewDto {
  return {
    id: 'r1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Found issues.',
    score: 42,
    model: 'claude-sonnet',
    created_at: '2026-01-01T00:00:00.000Z',
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded secret',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'A live key is committed.',
        suggestion: 'Move it to env.',
        confidence: 0.9,
        kind: 'finding',
        trifecta_components: null,
        evidence: null,
        review_id: 'r1',
        accepted_at: null,
        dismissed_at: null,
      },
    ],
    ...overrides,
  };
}

describe('get_findings tool', () => {
  it('returns all reviews for the PR, trimmed, when no agent_id is given', async () => {
    const reviewsForPull = vi.fn().mockResolvedValue([review(), review({ id: 'r2', agent_id: 'agent-2', run_id: 'run-2' })]);
    const handler = buildGetFindingsHandler({ reviewService: { reviewsForPull } }, 'ws-1');

    const result = await handler({ pr_id: 'pr-1' });

    expect(reviewsForPull).toHaveBeenCalledWith('ws-1', 'pr-1');
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      run_id: 'run-1',
      agent_name: 'Reviewer',
      verdict: 'request_changes',
      score: 42,
      summary: 'Found issues.',
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded secret',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'A live key is committed.',
          suggestion: 'Move it to env.',
        },
      ],
    });
  });

  it('filters to one agent when agent_id is given', async () => {
    const reviewsForPull = vi
      .fn()
      .mockResolvedValue([review({ id: 'r1', agent_id: 'agent-1' }), review({ id: 'r2', agent_id: 'agent-2', run_id: 'run-2' })]);
    const handler = buildGetFindingsHandler({ reviewService: { reviewsForPull } }, 'ws-1');

    const result = await handler({ pr_id: 'pr-1', agent_id: 'agent-2' });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].run_id).toBe('run-2');
  });

  it('empty findings/no reviews is a valid, non-error result', async () => {
    const reviewsForPull = vi.fn().mockResolvedValue([]);
    const handler = buildGetFindingsHandler({ reviewService: { reviewsForPull } }, 'ws-1');

    const result = await handler({ pr_id: 'pr-1' });

    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual([]);
  });

  it('maps "Pull request not found" to an isError tool result', async () => {
    const { NotFoundError } = await import('../src/platform/errors.js');
    const reviewsForPull = vi.fn().mockRejectedValue(new NotFoundError('Pull request not found'));
    const handler = buildGetFindingsHandler({ reviewService: { reviewsForPull } }, 'ws-1');

    const result = await handler({ pr_id: 'missing' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe('Pull request not found');
  });
});
