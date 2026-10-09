import { describe, it, expect } from 'vitest';
import { sameOrderedIds, snapshotSkillId, toAgentVersionDto } from '../src/modules/agents/helpers.js';
import type { AgentVersionRow } from '../src/modules/agents/repository.js';

function versionRow(skills: unknown): AgentVersionRow {
  return {
    agentId: 'ag1',
    version: 2,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    configJson: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      system_prompt: 'p',
      output_schema: null,
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      repo_intel: false,
      skills,
    },
  } as unknown as AgentVersionRow;
}

describe('snapshot skill versions (S-14)', () => {
  it('snapshotSkillId reads both plain-id (legacy) and {id, version} entries', () => {
    expect(snapshotSkillId('s1')).toBe('s1');
    expect(snapshotSkillId({ id: 's2', version: 3, name: 'n' })).toBe('s2');
  });

  it('toAgentVersionDto accepts new {id, version, name} snapshots and keeps the version', () => {
    const dto = toAgentVersionDto(versionRow([{ id: 's1', version: 4, name: 'Sec' }]));
    expect(dto.config.skills).toEqual([{ id: 's1', version: 4, name: 'Sec' }]);
  });

  it('toAgentVersionDto still accepts legacy plain-id snapshots and mixed lists', () => {
    expect(toAgentVersionDto(versionRow(['s1'])).config.skills).toEqual(['s1']);
    expect(toAgentVersionDto(versionRow(['s1', { id: 's2', version: 1 }])).config.skills).toHaveLength(2);
  });

  it('toAgentVersionDto rejects a malformed skill entry', () => {
    expect(() => toAgentVersionDto(versionRow([{ id: 's1' }]))).toThrow();
  });

  it('sameOrderedIds is order-sensitive (a reorder counts as a link change)', () => {
    expect(sameOrderedIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrderedIds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrderedIds(['a'], ['a', 'b'])).toBe(false);
  });
});
