import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { scoreEvalCase, type EvalExpectedFinding } from '../src/index.js';

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

function expected(overrides: Partial<EvalExpectedFinding> = {}): EvalExpectedFinding {
  return { severity: 'CRITICAL', file: 'src/config.ts', start_line: 10, ...overrides };
}

describe('scoreEvalCase', () => {
  it('exact match → recall=1, precision=1', () => {
    const score = scoreEvalCase([expected()], [actual()]);
    expect(score).toEqual({ recall: 1, precision: 1, matched: 1 });
  });

  it('empty expected + empty actual → both 1 (nothing to find, found nothing)', () => {
    expect(scoreEvalCase([], [])).toEqual({ recall: 1, precision: 1, matched: 0 });
  });

  it('expected something, got nothing → recall=0, precision=1 (nothing to divide by)', () => {
    expect(scoreEvalCase([expected()], [])).toEqual({ recall: 0, precision: 1, matched: 0 });
  });

  it('expected nothing, got something → precision=0 (extra findings are wrong)', () => {
    const score = scoreEvalCase([], [actual()]);
    expect(score.precision).toBe(0);
    expect(score.recall).toBe(1);
  });

  it('a missing expected finding lowers recall but not precision', () => {
    const score = scoreEvalCase([expected(), expected({ file: 'src/other.ts', start_line: 5 })], [actual()]);
    expect(score.matched).toBe(1);
    expect(score.recall).toBeCloseTo(0.5, 10);
    expect(score.precision).toBe(1);
  });

  it('an extra unexpected actual finding lowers precision but not recall', () => {
    const score = scoreEvalCase([expected()], [actual(), actual({ id: 'f2', start_line: 40, end_line: 40 })]);
    expect(score.matched).toBe(1);
    expect(score.recall).toBe(1);
    expect(score.precision).toBeCloseTo(0.5, 10);
  });

  it('severity mismatch is not a match even with the same file/line', () => {
    const score = scoreEvalCase([expected({ severity: 'WARNING' })], [actual({ severity: 'CRITICAL' })]);
    expect(score.matched).toBe(0);
    expect(score.recall).toBe(0);
  });

  it('file mismatch is not a match even with overlapping lines', () => {
    const score = scoreEvalCase([expected({ file: 'src/a.ts' })], [actual({ file: 'src/b.ts' })]);
    expect(score.matched).toBe(0);
  });

  it('non-overlapping line ranges are not a match', () => {
    const score = scoreEvalCase(
      [expected({ start_line: 10, end_line: 12 })],
      [actual({ start_line: 20, end_line: 22 })],
    );
    expect(score.matched).toBe(0);
  });

  it('overlapping (not identical) ranges DO match', () => {
    const score = scoreEvalCase(
      [expected({ start_line: 10, end_line: 15 })],
      [actual({ start_line: 14, end_line: 20 })],
    );
    expect(score.matched).toBe(1);
  });

  it('matching is one-to-one — two expected findings cannot both match the same actual one', () => {
    const score = scoreEvalCase([expected(), expected({ title: 'dup' })], [actual()]);
    expect(score.matched).toBe(1);
    expect(score.recall).toBeCloseTo(0.5, 10);
  });
});
