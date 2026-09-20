import type { Finding, Severity } from '@devdigest/shared';

/**
 * Eval scoring — compare a hand-authored "expected findings" list (an eval
 * case's `expected_output`) against a real review's grounded `Finding[]`.
 * Pure, no I/O — the caller (server) persists the result.
 */

/** A hand-authored expected finding — deliberately a SUBSET of `Finding`'s
 *  fields (no id/rationale/confidence — those aren't assertable ahead of
 *  time). `end_line` defaults to `start_line` when omitted. */
export interface EvalExpectedFinding {
  severity: Severity;
  file: string;
  start_line: number;
  end_line?: number;
  category?: string;
  title?: string;
}

export interface EvalScore {
  recall: number;
  precision: number;
  /** Count of expected findings matched by a distinct actual finding
   *  (one-to-one — an actual finding matches at most one expected one). */
  matched: number;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const [aLo, aHi] = aStart <= aEnd ? [aStart, aEnd] : [aEnd, aStart];
  const [bLo, bHi] = bStart <= bEnd ? [bStart, bEnd] : [bEnd, bStart];
  return aLo <= bHi && bLo <= aHi;
}

/**
 * Greedy one-to-one match: an expected finding matches the first unmatched
 * actual finding sharing its `file` + `severity` whose line range overlaps.
 * `recall`/`precision` follow the standard IR definitions: recall is 1 when
 * nothing was expected (nothing to miss); precision is 1 when nothing was
 * reported (nothing to be wrong about) — so "expected something, reported
 * nothing" is recall=0/precision=1, and "expected nothing, reported
 * something" is recall=1/precision=0.
 */
export function scoreEvalCase(expected: EvalExpectedFinding[], actual: Finding[]): EvalScore {
  const unmatchedActual = [...actual];
  let matched = 0;

  for (const exp of expected) {
    const expEnd = exp.end_line ?? exp.start_line;
    const hitIndex = unmatchedActual.findIndex(
      (act) =>
        act.file === exp.file &&
        act.severity === exp.severity &&
        rangesOverlap(exp.start_line, expEnd, act.start_line, act.end_line),
    );
    if (hitIndex !== -1) {
      unmatchedActual.splice(hitIndex, 1);
      matched++;
    }
  }

  const recall = expected.length > 0 ? matched / expected.length : 1;
  // Precision is only about what was actually reported — zero reports has
  // nothing incorrect among them, so it's vacuously 1 (a missed expected
  // finding is a recall problem, not a precision one).
  const precision = actual.length > 0 ? matched / actual.length : 1;

  return { recall, precision, matched };
}
