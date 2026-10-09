import { describe, it, expect } from 'vitest';
import { aggregateSuiteScores } from '@devdigest/reviewer-core';
import { CASES, RUNS } from '../src/db/seed-eval.js';

const pooled = (run: (typeof RUNS)[number]) =>
  aggregateSuiteScores(
    CASES.map((c) => {
      const k = run.counts[c.key];
      return { matched: k.m, expectedTotal: k.e, groundedTotal: k.g, noise: k.n, pass: k.pass, kept: k.k, dropped: k.d };
    }),
  );

describe('seeded Security Reviewer eval cases (SPEC-09)', () => {
  it('AC-15: seeds at least 8 cases with a balanced must_find / must_not_flag split', () => {
    const find = CASES.filter((c) => c.kind === 'must_find').length;
    const notFlag = CASES.filter((c) => c.kind === 'must_not_flag').length;
    expect(CASES.length).toBeGreaterThanOrEqual(8);
    expect(find).toBeGreaterThanOrEqual(4);
    expect(notFlag).toBeGreaterThanOrEqual(4);
    expect(Math.abs(find - notFlag)).toBeLessThanOrEqual(1);
  });

  it('AC-16: has unique names, and every must_not_flag case is empty or names a location', () => {
    expect(new Set(CASES.map((c) => c.name)).size).toBe(CASES.length);
    for (const c of CASES.filter((x) => x.kind === 'must_not_flag')) {
      for (const loc of c.expected as { file: string; start_line: number }[]) {
        expect(loc.file).toBe(c.file);
        expect(loc.start_line).toBeGreaterThan(0);
      }
    }
  });

  it('AC-16: every must_find case expects at least one finding in its own diff file', () => {
    for (const c of CASES.filter((x) => x.kind === 'must_find')) {
      expect(c.expected.length).toBeGreaterThan(0);
      expect(c.diff).toContain(`+++ b/${c.file}`);
    }
  });

  it('AC-17: the newest seeded run shows a precision drop vs the one before it', () => {
    const [latest, previous] = [RUNS[RUNS.length - 1]!, RUNS[RUNS.length - 2]!];
    expect(pooled(latest).precision!).toBeLessThan(pooled(previous).precision!);
  });
});
