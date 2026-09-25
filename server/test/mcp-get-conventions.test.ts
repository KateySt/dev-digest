import { describe, it, expect, vi } from 'vitest';
import type { ConventionCandidate } from '@devdigest/shared';
import { buildGetConventionsHandler } from '../src/modules/mcp/tools/get-conventions.js';

function convention(overrides: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'c1',
    category: 'naming',
    rule: 'Use camelCase for variables',
    rationale: 'Consistent with the rest of the codebase',
    evidence_path: 'src/foo.ts',
    evidence_snippet: 'const fooBar = 1',
    evidence_line: 12,
    confidence: 0.8,
    status: 'pending',
    ...overrides,
  };
}

describe('get_conventions tool', () => {
  it('calls ConventionsService.list and returns trimmed candidates', async () => {
    const list = vi.fn().mockResolvedValue([convention()]);
    const handler = buildGetConventionsHandler({ conventionsService: { list } }, 'ws-1');

    const result = await handler({ repo_id: 'repo-1' });

    expect(list).toHaveBeenCalledWith('ws-1', 'repo-1');
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toEqual([
      {
        id: 'c1',
        category: 'naming',
        rule: 'Use camelCase for variables',
        status: 'pending',
        evidence_path: 'src/foo.ts',
        evidence_line: 12,
        rationale: 'Consistent with the rest of the codebase',
      },
    ]);
  });

  it('filters client-side by status when given', async () => {
    const list = vi
      .fn()
      .mockResolvedValue([convention({ id: 'c1', status: 'pending' }), convention({ id: 'c2', status: 'accepted' })]);
    const handler = buildGetConventionsHandler({ conventionsService: { list } }, 'ws-1');

    const result = await handler({ repo_id: 'repo-1', status: 'accepted' });

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('c2');
  });

  it('maps a thrown error to an isError tool result', async () => {
    const list = vi.fn().mockRejectedValue(new Error('boom'));
    const handler = buildGetConventionsHandler({ conventionsService: { list } }, 'ws-1');

    const result = await handler({ repo_id: 'repo-1' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('boom');
  });
});
