/* lib/eval.ts — pure (no React, no I/O) helpers shared by the eval screens:
   metric descriptors/colours, point-delta formatting, old→new run ordering,
   a hand-rolled LCS line diff for system prompts, range constants and the
   "N / M passing" count. */
import type {
  AgentVersionConfig,
  EvalCaseListItem,
  EvalRange,
  EvalSuiteRun,
  PrFile,
  SkillEvalSuiteRun,
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

/** Any suite run, agent- or skill-owned (the two differ only in their version field). */
export type AnySuiteRun = EvalSuiteRun | SkillEvalSuiteRun;

/** The minimum a run needs to be ordered: when it started + its config version. */
export type VersionedRun = { started_at: string } & ({ agent_version: number } | { skill_version: number | null });

/** The config version a run executed against: the agent version for an agent
 *  run, the skill version for a skill run (null for a skill draft run). */
export function runVersion(run: VersionedRun): number | null {
  return "skill_version" in run ? run.skill_version : run.agent_version;
}

/** Order two suite runs old → new by version (ties: started_at). Works for
 *  agent and skill runs alike. */
export function orderRunsOldNew<T extends VersionedRun>(a: T, b: T): [T, T] {
  const va = runVersion(a) ?? 0;
  const vb = runVersion(b) ?? 0;
  if (va !== vb) return va < vb ? [a, b] : [b, a];
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

// ---- unified diff parsing (Case Editor preview + location checks) -----------

export interface LineRange {
  start: number;
  end: number;
}

/** One file of a pasted unified diff: a `PrFile`-shaped record the DiffViewer
 *  can render, plus the new-side line ranges its hunks cover. */
export interface ParsedDiffFile extends PrFile {
  /** New-side line ranges covered by the file's hunks (context included). */
  ranges: LineRange[];
}

/** `@@ -a[,b] +c[,d] @@` → groups: 1 old start, 2 old length, 3 new start, 4 new length. */
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(p: string): string {
  const path = p.replace(/\t.*$/, "").trim();
  return path.replace(/^"|"$/g, "").replace(/^[ab]\//, "");
}

/** Mutable accumulator for the file currently being parsed. */
interface FileDraft {
  path: string | null;
  patch: string[];
  additions: number;
  deletions: number;
  ranges: LineRange[];
}

/**
 * Parse pasted unified-diff text into per-file records. Tolerant by design —
 * the user is typing/pasting in a textarea: lines before the first hunk are
 * header noise, a file without `+++`/`---`/`diff --git` headers is skipped
 * (no path to attach hunks to), and malformed hunk headers are ignored.
 * Pure: never throws, returns [] for empty input.
 */
export function parseUnifiedDiff(raw: string | null | undefined): ParsedDiffFile[] {
  if (!raw || !raw.trim()) return [];
  const files: ParsedDiffFile[] = [];
  let cur: FileDraft | null = null;
  let pendingOld: string | null = null;
  // Lines still owed by the current hunk's declared lengths; while > 0 every
  // line belongs to the hunk, so a `--- a/x` deletion isn't read as a header.
  let oldLeft = 0;
  let newLeft = 0;

  const flush = () => {
    if (cur && cur.path && cur.patch.length > 0) {
      files.push({
        path: cur.path,
        additions: cur.additions,
        deletions: cur.deletions,
        patch: cur.patch.join("\n"),
        ranges: cur.ranges,
      });
    }
    cur = null;
  };
  const begin = (path: string | null): FileDraft => {
    flush();
    oldLeft = 0;
    newLeft = 0;
    const d: FileDraft = { path, patch: [], additions: 0, deletions: 0, ranges: [] };
    cur = d;
    return d;
  };

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const file = cur as FileDraft | null;
    // A new file/hunk header always ends the current hunk, even when a
    // hand-written hunk header's counts overshoot the lines actually present.
    // A `--- ` immediately followed by `+++ ` is a file header, not a deleted line.
    const fileHeader = line.startsWith("--- ") && (lines[i + 1] ?? "").startsWith("+++ ");
    if (line.startsWith("diff --git ") || line.startsWith("@@") || fileHeader) {
      oldLeft = 0;
      newLeft = 0;
    }
    if (file && (oldLeft > 0 || newLeft > 0)) {
      if (line.startsWith("+")) {
        file.additions++;
        newLeft--;
      } else if (line.startsWith("-")) {
        file.deletions++;
        oldLeft--;
      } else if (!line.startsWith("\\")) {
        oldLeft--;
        newLeft--;
      }
      file.patch.push(line);
      continue;
    }

    if (line.startsWith("diff --git ")) {
      const m = line.match(/ b\/(.+)$/);
      begin(m ? stripPrefix("b/" + m[1]) : null);
      pendingOld = null;
    } else if (line.startsWith("--- ")) {
      pendingOld = stripPrefix(line.slice(4));
      if (!file || file.patch.length > 0) begin(null);
    } else if (line.startsWith("+++ ")) {
      const next = stripPrefix(line.slice(4));
      const path = next === "/dev/null" ? pendingOld : next;
      if (!file || file.patch.length > 0) begin(path);
      else file.path = path;
    } else if (line.startsWith("@@")) {
      const m = line.match(HUNK_RE);
      if (!file || !m) continue;
      const start = parseInt(m[3]!, 10);
      const newLen = m[4] === undefined ? 1 : parseInt(m[4], 10);
      oldLeft = m[2] === undefined ? 1 : parseInt(m[2], 10);
      newLeft = newLen;
      if (newLen > 0) file.ranges.push({ start, end: start + newLen - 1 });
      file.patch.push(line);
    }
  }
  flush();
  return files;
}

/** True when `file:start–end` lies inside a hunk of the parsed diff. */
export function locationInDiff(
  files: readonly ParsedDiffFile[],
  file: string,
  start: number,
  end: number,
): { fileFound: boolean; linesFound: boolean } {
  const f = files.find((x) => x.path === file);
  if (!f) return { fileFound: false, linesFound: false };
  const linesFound = f.ranges.some((r) => start <= r.end && end >= r.start);
  return { fileFound: true, linesFound };
}
