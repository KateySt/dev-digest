import type { Finding } from '@devdigest/shared';

/**
 * Eval scoring — mechanical, no model call. A grounded finding matches an
 * expected entry / forbidden location IFF the file paths are equal and the
 * line ranges overlap; severity and category never affect matching. Pure,
 * no I/O — the caller (server) persists the result.
 */

/** Which assertion a case makes. */
export type EvalCaseKind = 'must_find' | 'must_not_flag';

/** A file + line range. `end_line` defaults to `start_line` when omitted. */
export interface EvalLocation {
  file: string;
  start_line: number;
  end_line?: number;
}

/** A hand-authored expected finding. Only the location is matched; the other
 *  fields are descriptive. Severity is a plain string on purpose (ignored). */
export interface EvalExpectedFinding extends EvalLocation {
  severity?: string;
  category?: string;
  title?: string;
}

/** A forbidden location of a `must_not_flag` case. */
export type EvalForbiddenLocation = EvalLocation;

/** Raw per-case counts — kept raw so suite metrics pool instead of averaging. */
export interface EvalCaseScore {
  /** `must_find`: expected entries matched one-to-one by a grounded finding. */
  matched: number;
  /** `must_find`: number of expected entries (0 for `must_not_flag`). */
  expectedTotal: number;
  /** Grounded findings the review produced. */
  groundedTotal: number;
  /** Grounded findings that count against precision. */
  noise: number;
  pass: boolean;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const [aLo, aHi] = aStart <= aEnd ? [aStart, aEnd] : [aEnd, aStart];
  const [bLo, bHi] = bStart <= bEnd ? [bStart, bEnd] : [bEnd, bStart];
  return aLo <= bHi && bLo <= aHi;
}

function matches(loc: EvalLocation, act: Finding): boolean {
  return (
    act.file === loc.file &&
    rangesOverlap(loc.start_line, loc.end_line ?? loc.start_line, act.start_line, act.end_line)
  );
}

/**
 * Score ONE case.
 *  - `must_find`: expected entries are matched one-to-one (each expected takes
 *    the first still-unmatched overlapping finding); every unmatched grounded
 *    finding is noise. Passes iff every expected entry matched (noise is fine).
 *  - `must_not_flag`: a grounded finding overlapping any forbidden location is
 *    noise; an EMPTY location list forbids the whole diff, so every grounded
 *    finding is noise. Passes iff there is no noise.
 */
export function scoreEvalCase(
  kind: EvalCaseKind,
  locations: EvalLocation[],
  actual: Finding[],
): EvalCaseScore {
  if (kind === 'must_not_flag') {
    const noise =
      locations.length === 0
        ? actual.length
        : actual.filter((act) => locations.some((loc) => matches(loc, act))).length;
    return { matched: 0, expectedTotal: 0, groundedTotal: actual.length, noise, pass: noise === 0 };
  }

  const unmatched = [...actual];
  let matched = 0;
  for (const exp of locations) {
    const hit = unmatched.findIndex((act) => matches(exp, act));
    if (hit !== -1) {
      unmatched.splice(hit, 1);
      matched++;
    }
  }
  return {
    matched,
    expectedTotal: locations.length,
    groundedTotal: actual.length,
    noise: unmatched.length,
    pass: matched === locations.length,
  };
}

/** What `aggregateSuiteScores` needs per NON-errored case: the case score plus
 *  the grounding gate's kept / dropped finding counts. */
export interface EvalSuiteCaseInput extends EvalCaseScore {
  kept: number;
  dropped: number;
}

export interface EvalSuiteScores {
  /** Pooled matched / expected over `must_find` expectations; null if none. */
  recall: number | null;
  /** Pooled non-noise / grounded findings; null if no grounded findings. */
  precision: number | null;
  /** Pooled kept / (kept + dropped); null if the gate saw nothing. */
  citationAccuracy: number | null;
  passed: number;
  evaluated: number;
}

/** Raw counts the three ratio metrics are derived from (per case or pooled). */
export interface EvalMetricCounts {
  matched: number;
  expectedTotal: number;
  groundedTotal: number;
  noise: number;
  kept: number;
  dropped: number;
}

/** The single source of the metric formulas. Zero denominator yields null. */
export function computeEvalMetrics(c: EvalMetricCounts): {
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
} {
  return {
    recall: c.expectedTotal > 0 ? c.matched / c.expectedTotal : null,
    precision: c.groundedTotal > 0 ? (c.groundedTotal - c.noise) / c.groundedTotal : null,
    citationAccuracy: c.kept + c.dropped > 0 ? c.kept / (c.kept + c.dropped) : null,
  };
}

/**
 * Pool a suite run's metrics over its non-errored cases (the caller excludes
 * errored ones). Pooled = sum of numerators / sum of denominators — NOT a mean
 * of per-case ratios. A zero denominator yields null, never 0 or 1.
 */
export function aggregateSuiteScores(cases: EvalSuiteCaseInput[]): EvalSuiteScores {
  let matched = 0;
  let expected = 0;
  let grounded = 0;
  let noise = 0;
  let kept = 0;
  let dropped = 0;
  let passed = 0;
  for (const c of cases) {
    matched += c.matched;
    expected += c.expectedTotal;
    grounded += c.groundedTotal;
    noise += c.noise;
    kept += c.kept;
    dropped += c.dropped;
    if (c.pass) passed++;
  }
  return {
    ...computeEvalMetrics({
      matched,
      expectedTotal: expected,
      groundedTotal: grounded,
      noise,
      kept,
      dropped,
    }),
    passed,
    evaluated: cases.length,
  };
}
