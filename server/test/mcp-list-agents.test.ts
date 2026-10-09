import { describe, it, expect, vi } from 'vitest';
import type { Agent } from '@devdigest/shared';
import { buildListAgentsHandler } from '../src/modules/mcp/tools/list-agents.js';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'Reviewer',
    description: 'desc',
    provider: 'anthropic',
    model: 'claude-sonnet',
    system_prompt: 'SECRET PROMPT',
    output_schema: { some: 'schema' },
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...overrides,
  };
}

describe('list_agents tool', () => {
  it('calls AgentsService.list with the workspace id and returns trimmed agents', async () => {
    const list = vi.fn().mockResolvedValue([agent()]);
    const handler = buildListAgentsHandler({ agentsService: { list } }, 'ws-1');

    const result = await handler();

    expect(list).toHaveBeenCalledWith('ws-1');
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed).toEqual([
      { id: 'a1', name: 'Reviewer', provider: 'anthropic', model: 'claude-sonnet', enabled: true },
    ]);
    // system_prompt / output_schema must never leak through.
    expect(JSON.stringify(parsed)).not.toContain('SECRET PROMPT');
  });

  it('returns an empty array (not an error) when the workspace has no agents', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const handler = buildListAgentsHandler({ agentsService: { list } }, 'ws-1');

    const result = await handler();

    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual([]);
  });

  it('maps a thrown service error to an isError tool result instead of throwing', async () => {
    const list = vi.fn().mockRejectedValue(new Error('db unreachable'));
    const handler = buildListAgentsHandler({ agentsService: { list } }, 'ws-1');

    const result = await handler();

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('db unreachable');
  });
});
