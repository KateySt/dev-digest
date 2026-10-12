import { describe, it, expect } from 'vitest';
import { loadMemory } from './memory.js';

// SPEC-2026-10-12-memory AC-30a — the runner keeps only the memory lines meant
// for this agent whose path globs match a changed file.
const fileWith = (text: string) => (() => text) as unknown as typeof import('node:fs').readFileSync;
const line = (o: Record<string, unknown>) => JSON.stringify(o);

describe('loadMemory', () => {
  const opts = { agentSlug: 'security', changedFiles: ['src/middleware/ratelimit.ts', 'README.md'] };

  it('drops lines whose globs match no changed file', () => {
    const raw = [
      line({ kind: 'fact', content: 'mw rule', path_globs: ['src/middleware/**'], agent_slugs: null }),
      line({ kind: 'fact', content: 'docs rule', path_globs: ['docs/**'], agent_slugs: null }),
      line({ kind: 'learning', content: 'anywhere', path_globs: [], agent_slugs: null }),
    ].join('\n');
    expect(loadMemory('.devdigest', opts, fileWith(raw))).toEqual([
      { kind: 'fact', content: 'mw rule' },
      { kind: 'learning', content: 'anywhere' },
    ]);
  });

  it('keeps only lines for this agent slug (null = all agents)', () => {
    const raw = [
      line({ kind: 'fact', content: 'mine', path_globs: [], agent_slugs: ['security'] }),
      line({ kind: 'fact', content: 'theirs', path_globs: [], agent_slugs: ['performance'] }),
      line({ kind: 'fact', content: 'everyone', path_globs: [], agent_slugs: null }),
    ].join('\n');
    expect(loadMemory('.devdigest', opts, fileWith(raw)).map((m) => m.content)).toEqual(['mine', 'everyone']);
  });

  it('legacy string line → fact entry', () => {
    const raw = [JSON.stringify('legacy quoted'), 'legacy plain'].join('\n');
    expect(loadMemory('.devdigest', opts, fileWith(raw))).toEqual([
      { kind: 'fact', content: 'legacy quoted' },
      { kind: 'fact', content: 'legacy plain' },
    ]);
  });

  it('caps at 20 entries', () => {
    const raw = Array.from({ length: 30 }, (_, i) => line({ kind: 'fact', content: `m${i}`, path_globs: [], agent_slugs: null })).join('\n');
    expect(loadMemory('.devdigest', opts, fileWith(raw))).toHaveLength(20);
  });

  it('missing file → []', () => {
    const missing = (() => {
      throw new Error('ENOENT');
    }) as unknown as typeof import('node:fs').readFileSync;
    expect(loadMemory('.devdigest', opts, missing)).toEqual([]);
  });
});
