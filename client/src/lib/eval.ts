/* lib/eval.ts — pure (no React, no I/O) helpers shared by the eval screens:
   metric descriptors/colours, point-delta formatting, old→new run ordering,
   a hand-rolled LCS line diff for system prompts, range constants and the
   "N / M passing" count. */
import type {
  AgentVersionConfig,
  EvalCaseListItem,
  EvalRange,
  EvalSuiteRun,
} from "@devdigest/shared";

// ---- metrics ---------------------------------------------------------------

export type MetricKey = "recall" | "precision" | "citation_accuracy";

/** One metric descriptor. Colour is the SAME everywhere (tiles, cards,
 *  sparklines, trend lines, table bars, legend): recall blue, precision
 *  green, citation amber. */
export interface MetricDef {
  key: MetricKey;
  color: string;
}

export const METRICS: readonly MetricDef[] = [
  { key: "recall", color: "var(--accent)" },
  { key: "precision", color: "var(--ok)" },
  { key: "citation_accuracy", color: "var(--warn)" },
];

export const METRIC_COLOR: Record<MetricKey, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};

/** "82" for 0.82; "—" for null. Rounds to whole percent. */
export function formatPercent(v: number | null | undefined): string {
  return v == null ? "—" : String(Math.round(v * 100));
}

export type DeltaDirection = "up" | "down" | "flat";

export interface PointDelta {
  /** Absolute points, rounded to a whole number ("4" for 0.04). */
  points: number;
  direction: DeltaDirection;
}

/** Signed delta in whole percentage points from a fractional delta (0.04 →
 *  4pt up). Null in → null out (no delta shown). */
export function toPointDelta(delta: number | null | undefined): PointDelta | null {
  if (delta == null) return null;
  const points = Math.round(Math.abs(delta) * 100);
  return { points, direction: points === 0 ? "flat" : delta > 0 ? "up" : "down" };
}

/** "▲ 4pt" / "▼ 2pt" / "0pt". */
export function formatPointDelta(d: PointDelta): string {
  const arrow = d.direction === "up" ? "▲ " : d.direction === "down" ? "▼ " : "";
  return `${arrow}${d.points}pt`;
}

/** Delta colour: rise green, drop red, flat muted. `invert` flips it for cost
 *  (a rise is bad). */
export function deltaColor(direction: DeltaDirection, invert = false): string {
  if (direction === "flat") return "var(--text-muted)";
  const good = invert ? direction === "down" : direction === "up";
  return good ? "var(--ok)" : "var(--crit)";
}

/** Dollar delta for cost cards: "+$0.02" / "-$0.01". */
export function formatCostDelta(delta: number): string {
  const abs = Math.abs(delta).toFixed(2);
  return `${delta >= 0 ? "+" : "-"}$${abs}`;
}

// ---- runs ------------------------------------------------------------------

/** Order two suite runs old → new by agent version (ties: started_at). */
export function orderRunsOldNew<T extends Pick<EvalSuiteRun, "agent_version" | "started_at">>(
  a: T,
  b: T,
): [T, T] {
  if (a.agent_version !== b.agent_version) return a.agent_version < b.agent_version ? [a, b] : [b, a];
  return a.started_at <= b.started_at ? [a, b] : [b, a];
}

/** `YYYY-MM-DD HH:mm` in local time (the runs table's mono timestamp). */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- range -----------------------------------------------------------------

export const RANGE_OPTIONS: readonly EvalRange[] = ["7d", "30d", "90d", "all"];
export const DEFAULT_RANGE: EvalRange = "30d";

/** Narrow an untrusted `?range=` value to a valid range (default 30d). */
export function parseRange(raw: string | null | undefined): EvalRange {
  return RANGE_OPTIONS.includes(raw as EvalRange) ? (raw as EvalRange) : DEFAULT_RANGE;
}

// ---- cases -----------------------------------------------------------------

/** "N / M passing": M counts only cases that have a result (errored results
 *  excluded from both — they didn't evaluate). */
export function countPassing(cases: readonly EvalCaseListItem[]): { passing: number; withResult: number } {
  let passing = 0;
  let withResult = 0;
  for (const c of cases) {
    const r = c.last_run;
    if (!r || r.status === "errored") continue;
    withResult += 1;
    if (r.pass) passing += 1;
  }
  return { passing, withResult };
}

export interface CaseLocation {
  file: string;
  start_line: number;
  end_line?: number;
}

/** Valid `{file,start_line,end_line?}` entries of a case's expected_output
 *  (expected findings or forbidden locations); anything malformed is skipped. */
export function caseLocations(expected: unknown): CaseLocation[] {
  if (!Array.isArray(expected)) return [];
  return expected.flatMap((e) => {
    const o = e as Partial<CaseLocation> | null;
    return o && typeof o.file === "string" && typeof o.start_line === "number"
      ? [{ file: o.file, start_line: o.start_line, ...(typeof o.end_line === "number" ? { end_line: o.end_line } : {}) }]
      : [];
  });
}

/** `file:L10–L12` (or `file:L10` when single-line). */
export function formatLocation(l: CaseLocation): string {
  const end = l.end_line != null && l.end_line !== l.start_line ? `–L${l.end_line}` : "";
  return `${l.file}:L${l.start_line}${end}`;
}

/** Number of findings recorded in a run's `actual_output`. */
export function actualCount(actual: unknown): number {
  return Array.isArray(actual) ? actual.length : 0;
}

// ---- config / skills -------------------------------------------------------

export interface SkillRef {
  id: string;
  version: number | null;
  name: string | null;
}

/** Snapshot skill entries are plain ids (old) or `{id, version, name?}` (new). */
export function normalizeSkills(skills: AgentVersionConfig["skills"] | undefined): SkillRef[] {
  return (skills ?? []).map((s) =>
    typeof s === "string" ? { id: s, version: null, name: null } : { id: s.id, version: s.version, name: s.name ?? null },
  );
}

// ---- line diff (hand-rolled LCS) ------------------------------------------

export type DiffLineKind = "same" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/**
 * Line diff of two texts via longest-common-subsequence: lines only in `a`
 * are `del`, only in `b` are `add`, shared ones `same` (in order). O(n·m)
 * which is fine for system prompts. Output is plain text — callers render it
 * as text, never HTML.
 */
export function lineDiff(a: string, b: string): DiffLine[] {
  const x = a.length ? a.split("\n") : [];
  const y = b.length ? b.split("\n") : [];
  const n = x.length;
  const m = y.length;
  // lcs[i][j] = LCS length of x[i..] and y[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ kind: "same", text: x[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: x[i++]! });
    } else {
      out.push({ kind: "add", text: y[j++]! });
    }
  }
  while (i < n) out.push({ kind: "del", text: x[i++]! });
  while (j < m) out.push({ kind: "add", text: y[j++]! });
  return out;
}

export type DiffChunk = DiffLine | { kind: "skip"; count: number };

/**
 * Collapse long runs of unchanged lines: keep `context` lines around every
 * changed line and replace the rest with one `skip` marker per run, so a
 * one-line prompt change in a 200-line prompt stays readable.
 */
export function collapseDiff(lines: readonly DiffLine[], context = 3): DiffChunk[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const out: DiffChunk[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i] || lines.every((x) => x.kind === "same")) {
      if (skipped > 0) out.push({ kind: "skip", count: skipped });
      skipped = 0;
      out.push(l);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ kind: "skip", count: skipped });
  return out;
}
