import { describe, it, expect } from 'vitest';
import { buildQueryText, selectWithinBudget } from '../src/modules/memory/retrieval.js';

// SPEC-2026-10-12-memory AC-15 / AC-16 — pure parts of retrieval.
const entry = (id: string, content: string) => ({ id, kind: 'fact' as const, content });
const chars = (s: string) => s.length;

describe('selectWithinBudget', () => {
  it('drops whole entries over budget, never truncates one', () => {
    const ranked = [entry('a', 'x'.repeat(40)), entry('b', 'y'.repeat(80)), entry('c', 'z'.repeat(10))];
    const out = selectWithinBudget(ranked, chars, 75, 20);
    // rendered+newline: a=50, b=90, c=20 → a fits, b would overflow and is skipped whole, c still fits
    expect(out.map((e) => e.id)).toEqual(['a', 'c']);
    expect(out.every((e) => ranked.find((r) => r.id === e.id)!.content === e.content)).toBe(true);
  });

  it('caps at 20', () => {
    const ranked = Array.from({ length: 30 }, (_, i) => entry(String(i), 'x'));
    expect(selectWithinBudget(ranked, chars, 10_000, 20)).toHaveLength(20);
  });

  it('keeps rank order', () => {
    const ranked = [entry('3', 'c'), entry('1', 'a'), entry('2', 'b')];
    expect(selectWithinBudget(ranked, chars, 10_000, 20).map((e) => e.id)).toEqual(['3', '1', '2']);
  });

  it('counts the rendered line, not just the content', () => {
    // "- [fact] " prefix (9 chars) + content must fit
    const out = selectWithinBudget([entry('a', 'x'.repeat(10))], chars, 15, 20);
    expect(out).toEqual([]);
  });
});

describe('buildQueryText', () => {
  it('joins title + files and truncates diff to 4000', () => {
    const q = buildQueryText('Add rate limiting', ['src/a.ts', 'src/b.ts'], 'd'.repeat(10_000));
    expect(q.startsWith('Add rate limiting\nsrc/a.ts\nsrc/b.ts\n')).toBe(true);
    expect(q.length).toBe('Add rate limiting\nsrc/a.ts\nsrc/b.ts\n'.length + 4000);
  });
});
