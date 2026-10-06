import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import {
  scoreEvalCase,
  aggregateSuiteScores,
  computeEvalMetrics,
  type EvalLocation,
  type EvalSuiteCaseInput,
} from '../src/index.js';

function actual(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    file: 'src/config.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    confidence: 0.9,
    ...overrides,
  } as Finding;
}

function loc(overrides: Partial<EvalLocation> = {}): EvalLocation {
  return { file: 'src/config.ts', start_line: 10, ...overrides };
}

describe('scoreEvalCase — matching (S-29)', () => {
  it('same file and same line matches', () => {
    const s = scoreEvalCase('must_find', [loc()], [actual()]);
    expect(s).toEqual({ matched: 1, expectedTotal: 1, groundedTotal: 1, noise: 0, pass: true });
  });

  it('severity and category never affect matching', () => {
    const s = scoreEvalCase(
      'must_find',
      [{ ...loc(), severity: 'INFO', category: 'style' }],
      [actual({ severity: 'CRITICAL', category: 'security' })],
    );
    expect(s.matched).toBe(1);
  });

  it('file mismatch is not a match even with overlapping lines', () => {
    const s = scoreEvalCase('must_find', [loc({ file: 'src/a.ts' })], [actual({ file: 'src/b.ts' })]);
    expect(s.matched).toBe(0);
    expect(s.pass).toBe(false);
  });

  it('non-overlapping ranges do not match', () => {
    const s = scoreEvalCase(
      'must_find',
      [loc({ start_line: 10, end_line: 12 })],
      [actual({ start_line: 20, end_line: 22 })],
    );
    expect(s.matched).toBe(0);
  });

  it('overlapping, non-identical ranges match; touching edge lines overlap', () => {
    expect(
      scoreEvalCase('must_find', [loc({ start_line: 10, end_line: 15 })], [actual({ start_line: 14, end_line: 20 })])
        .matched,
    ).toBe(1);
    expect(
      scoreEvalCase('must_find', [loc({ start_line: 10, end_line: 15 })], [actual({ start_line: 15, end_line: 20 })])
        .matched,
    ).toBe(1);
  });

  it('end_line defaults to start_line when omitted', () => {
    expect(scoreEvalCase('must_find', [loc({ start_line: 11 })], [actual({ start_line: 10, end_line: 12 })]).matched).toBe(1);
    expect(scoreEvalCase('must_find', [loc({ start_line: 13 })], [actual({ start_line: 10, end_line: 12 })]).matched).toBe(0);
  });
});

describe('scoreEvalCase — must_find (S-30, S-37)', () => {
  it('one-to-one: two expectations cannot both match the same finding', () => {
    const s = scoreEvalCase('must_find', [loc(), loc()], [actual()]);
    expect(s.matched).toBe(1);
    expect(s.expectedTotal).toBe(2);
    expect(s.pass).toBe(false);
  });

  it('two expectations match two findings one-to-one', () => {
    const s = scoreEvalCase(
      'must_find',
      [loc(), loc()],
      [actual({ id: 'a' }), actual({ id: 'b' })],
    );
    expect(s).toMatchObject({ matched: 2, noise: 0, pass: true });
  });

  it('every unmatched grounded finding is noise, but noise does not fail the case', () => {
    const s = scoreEvalCase('must_find', [loc()], [actual(), actual({ id: 'f2', start_line: 40, end_line: 40 })]);
    expect(s).toMatchObject({ matched: 1, groundedTotal: 2, noise: 1, pass: true });
  });

  it('a missed expectation fails the case', () => {
    const s = scoreEvalCase('must_find', [loc(), loc({ file: 'src/other.ts', start_line: 5 })], [actual()]);
    expect(s).toMatchObject({ matched: 1, expectedTotal: 2, noise: 0, pass: false });
  });

  it('no findings at all fails a must_find case', () => {
    const s = scoreEvalCase('must_find', [loc()], []);
    expect(s).toEqual({ matched: 0, expectedTotal: 1, groundedTotal: 0, noise: 0, pass: false });
  });
});

describe('scoreEvalCase — must_not_flag (S-31, S-32, S-37)', () => {
  it('finding overlapping a forbidden location is noise and fails', () => {
    const s = scoreEvalCase('must_not_flag', [loc({ start_line: 8, end_line: 12 })], [actual()]);
    expect(s).toEqual({ matched: 0, expectedTotal: 0, groundedTotal: 1, noise: 1, pass: false });
  });

  it('finding elsewhere is not noise and the case passes', () => {
    const s = scoreEvalCase(
      'must_not_flag',
      [loc({ start_line: 8, end_line: 12 })],
      [actual({ start_line: 50, end_line: 50 }), actual({ id: 'g', file: 'src/other.ts' })],
    );
    expect(s).toMatchObject({ groundedTotal: 2, noise: 0, pass: true });
  });

  it('empty location list forbids the whole diff: every grounded finding is noise', () => {
    const s = scoreEvalCase('must_not_flag', [], [actual(), actual({ id: 'f2', file: 'x.ts' })]);
    expect(s).toMatchObject({ groundedTotal: 2, noise: 2, pass: false });
  });

  it('empty location list with no findings passes', () => {
    expect(scoreEvalCase('must_not_flag', [], [])).toMatchObject({ noise: 0, pass: true });
  });
});

function caseInput(overrides: Partial<EvalSuiteCaseInput> = {}): EvalSuiteCaseInput {
  return {
    matched: 0,
    expectedTotal: 0,
    groundedTotal: 0,
    noise: 0,
    pass: true,
    kept: 0,
    dropped: 0,
    ...overrides,
  };
}

describe('aggregateSuiteScores (S-33…S-36)', () => {
  it('pools recall over all expectations, not a mean of per-case ratios (S-33)', () => {
    // case A: 1/1 (ratio 1.0); case B: 1/3 (ratio 0.33). Mean = 0.667, pooled = 2/4.
    const r = aggregateSuiteScores([
      caseInput({ matched: 1, expectedTotal: 1 }),
      caseInput({ matched: 1, expectedTotal: 3, pass: false }),
    ]);
    expect(r.recall).toBe(0.5);
  });

  it('pools precision as non-noise / grounded (S-34)', () => {
    // A: 1 grounded 0 noise; B: 3 grounded 2 noise => (4-2)/4 = 0.5
    const r = aggregateSuiteScores([
      caseInput({ groundedTotal: 1, noise: 0 }),
      caseInput({ groundedTotal: 3, noise: 2, pass: false }),
    ]);
    expect(r.precision).toBe(0.5);
  });

  it('pools citation accuracy as kept / (kept + dropped) (S-35)', () => {
    const r = aggregateSuiteScores([caseInput({ kept: 3, dropped: 1 }), caseInput({ kept: 1, dropped: 3 })]);
    expect(r.citationAccuracy).toBe(0.5);
  });

  it('returns null for zero denominators, never 0 or 1 (S-36)', () => {
    const r = aggregateSuiteScores([caseInput({ pass: true })]);
    expect(r.recall).toBeNull();
    expect(r.precision).toBeNull();
    expect(r.citationAccuracy).toBeNull();
    expect(aggregateSuiteScores([])).toEqual({
      recall: null,
      precision: null,
      citationAccuracy: null,
      passed: 0,
      evaluated: 0,
    });
  });

  it('a metric with data stays numeric while another is null (S-36)', () => {
    const r = aggregateSuiteScores([caseInput({ kept: 2, dropped: 0 })]);
    expect(r.citationAccuracy).toBe(1);
    expect(r.recall).toBeNull();
  });

  it('counts passed and evaluated cases', () => {
    const r = aggregateSuiteScores([caseInput({ pass: true }), caseInput({ pass: false }), caseInput({ pass: true })]);
    expect(r).toMatchObject({ passed: 2, evaluated: 3 });
  });
});

describe('computeEvalMetrics (S-33…S-36)', () => {
  it('returns null for zero denominators', () => {
    expect(
      computeEvalMetrics({ matched: 0, expectedTotal: 0, groundedTotal: 0, noise: 0, kept: 0, dropped: 0 }),
    ).toEqual({ recall: null, precision: null, citationAccuracy: null });
  });

  it('computes recall, precision, and citation accuracy from raw counts', () => {
    expect(
      computeEvalMetrics({ matched: 1, expectedTotal: 2, groundedTotal: 4, noise: 1, kept: 3, dropped: 1 }),
    ).toEqual({ recall: 0.5, precision: 0.75, citationAccuracy: 0.75 });
  });
});
