import { describe, it, expect, vi } from 'vitest';
import type { BlastRadius } from '@devdigest/shared';
import { buildGetBlastRadiusHandler } from '../src/modules/mcp/tools/get-blast-radius.js';

const PULL = { id: 'pr-1', repoId: 'repo-1' } as never;

const RADIUS: BlastRadius = {
  changed_symbols: [{ name: 'foo', file: 'src/a.ts', kind: 'function' }],
  downstream: [],
  summary: '1 changed symbol, 0 callers, 0 endpoints and 0 crons affected',
};

describe('get_blast_radius tool', () => {
  it('looks up the pull then returns BlastService.getOrCompute() as-is', async () => {
    const getPull = vi.fn().mockResolvedValue(PULL);
    const getOrCompute = vi.fn().mockResolvedValue(RADIUS);
    const handler = buildGetBlastRadiusHandler({ reviewRepo: { getPull }, blastService: { getOrCompute } }, 'ws-1');

    const result = await handler({ pr_id: 'pr-1' });

    expect(getPull).toHaveBeenCalledWith('ws-1', 'pr-1');
    expect(getOrCompute).toHaveBeenCalledWith('ws-1', PULL);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(RADIUS);
  });

  it('returns a clear "PR not found" error when the pull does not resolve', async () => {
    const getPull = vi.fn().mockResolvedValue(undefined);
    const getOrCompute = vi.fn();
    const handler = buildGetBlastRadiusHandler({ reviewRepo: { getPull }, blastService: { getOrCompute } }, 'ws-1');

    const result = await handler({ pr_id: 'missing' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe('Pull request not found');
    expect(getOrCompute).not.toHaveBeenCalled();
  });
});
