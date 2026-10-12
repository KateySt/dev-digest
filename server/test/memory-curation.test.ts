import { describe, it, expect } from 'vitest';
import {
  groupPairs,
  pickPrimary,
  trimGroup,
  staleReasons,
  embeddingPairs,
  type CurationCandidate,
} from '../src/modules/memory/helpers.js';

/** SPEC-2026-10-12-memory-curation — pure scan logic (Task 3). */

const now = new Date('2026-10-12T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const row = (id: string, over: Partial<CurationCandidate> = {}): CurationCandidate => ({
  id,
  confidence: 0.5,
  sources: [],
  lastUsedAt: null,
  createdAt: daysAgo(1),
  keptAt: null,
  appliesToAllAgents: true,
  ...over,
});

describe('groupPairs', () => {
  it('groupPairs joins A~B and B~C into one group', () => {
    const groups = groupPairs(['a', 'b', 'c', 'd'], [
      { a: 'a', b: 'b', score: 0.9 },
      { a: 'b', b: 'c', score: 0.9 },
    ]);
    expect(groups).toHaveLength(1);
    expect([...groups[0]!].sort()).toEqual(['a', 'b', 'c']);
  });

  it('groupPairs ignores singletons', () => {
    expect(groupPairs(['a', 'b'], [])).toEqual([]);
  });
});

describe('embeddingPairs', () => {
  it('keeps only pairs at or above the floor', () => {
    const pairs = embeddingPairs(
      [
        { id: 'a', vec: [1, 0] },
        { id: 'b', vec: [1, 0] },
        { id: 'c', vec: [0, 1] },
      ],
      0.88,
    );
    expect(pairs).toEqual([{ a: 'a', b: 'b', score: expect.closeTo(1, 6) }]);
  });
});

describe('pickPrimary', () => {
  it('pickPrimary prefers confidence, then sources, then recent use', () => {
    expect(pickPrimary([row('a', { confidence: 0.4 }), row('b', { confidence: 0.9 })])).toBe('b');
    expect(
      pickPrimary([row('a'), row('b', { sources: [{ context: 'x' }, { context: 'y' }] })]),
    ).toBe('b');
    expect(
      pickPrimary([row('a', { lastUsedAt: daysAgo(10) }), row('b', { lastUsedAt: daysAgo(2) }), row('c')]),
    ).toBe('b');
  });
});

describe('trimGroup', () => {
  it('trimGroup keeps primary plus 9 closest', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `m${i}`);
    const pairs = ids.slice(1).map((id, i) => ({ a: 'm0', b: id, score: 0.89 + i * 0.001 }));
    const kept = trimGroup(ids, 'm0', pairs, 10);
    expect(kept).toHaveLength(10);
    expect(kept[0]).toBe('m0');
    // the two weakest links to the primary (m1, m2) are dropped
    expect(kept).not.toContain('m1');
    expect(kept).not.toContain('m2');
  });
});

describe('staleReasons', () => {
  it('staleReasons returns unused and unlinked', () => {
    expect(staleReasons({ ...row('a', { createdAt: daysAgo(90), appliesToAllAgents: false }), linkCount: 0 }, now)).toEqual([
      'unused',
      'unlinked',
    ]);
    expect(staleReasons({ ...row('a'), linkCount: 0 }, now)).toEqual([]);
  });

  it('staleReasons respects kept_at', () => {
    expect(staleReasons({ ...row('a', { createdAt: daysAgo(90), keptAt: daysAgo(3) }), linkCount: 1 }, now)).toEqual([]);
    // Keep never hides "unlinked"
    expect(
      staleReasons({ ...row('a', { createdAt: daysAgo(90), keptAt: daysAgo(3), appliesToAllAgents: false }), linkCount: 0 }, now),
    ).toEqual(['unlinked']);
  });
});

import { MERGE_DRAFT_SYSTEM_PROMPT } from '../src/modules/memory/prompts.js';

describe('MERGE_DRAFT_SYSTEM_PROMPT', () => {
  it('treats members as untrusted data and caps length', () => {
    expect(MERGE_DRAFT_SYSTEM_PROMPT).toContain('untrusted');
    expect(MERGE_DRAFT_SYSTEM_PROMPT).toContain('600');
  });
});

import { parseTsvector, ftsScore, textPairs } from '../src/modules/memory/helpers.js';

describe('full-text pairing (review fix #3)', () => {
  it('parseTsvector counts positions per lexeme, including quoted apostrophes', () => {
    const lex = parseTsvector(`'bucket':1,7 'it''s':3 'key':2`);
    expect(lex.get('bucket')).toBe(2);
    expect(lex.get("it's")).toBe(1);
    expect(lex.get('key')).toBe(1);
  });

  it('ftsScore is ts_rank_cd(OR-query, 32) for k matched positions', () => {
    expect(ftsScore(0)).toBe(0);
    expect(ftsScore(4)).toBeCloseTo(0.4 / 1.4, 10);
  });

  it('textPairs keeps the max-direction score and only pairs touching ids', () => {
    const rows = [
      { id: 'a', lex: new Map([['x', 1], ['y', 1], ['z', 1], ['w', 1]]) },
      { id: 'b', lex: new Map([['x', 2], ['y', 2], ['q', 1]]) },
      { id: 'c', lex: new Map([['q', 1]]) },
    ];
    // a→b: b has x×2 + y×2 = 4 positions; b→a: a has x + y = 2 → max is 4
    expect(textPairs(rows, new Set(['a']), 0.25)).toEqual([{ a: 'a', b: 'b', score: ftsScore(4) }]);
    expect(textPairs(rows, new Set(['c']), 0.01)).toEqual([{ a: 'b', b: 'c', score: ftsScore(1) }]);
  });
});
