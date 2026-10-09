import type { EvalCaseKind, FindingCategory, Severity } from "@devdigest/shared";
import { locationInDiff, type ParsedDiffFile } from "@/lib/eval";

/** Pure model behind the Case Editor's structured form: one editable row per
 *  expected finding (must find) or forbidden location (must not flag). Line
 *  fields are kept as strings so half-typed / invalid input stays visible and
 *  can be flagged instead of being silently coerced. */

export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
export const CATEGORIES: readonly FindingCategory[] = ["bug", "security", "perf", "style", "test"];

export interface EntryDraft {
  file: string;
  start: string;
  end: string;
  severity: Severity;
  category: FindingCategory;
  title: string;
}

export function emptyEntry(): EntryDraft {
  return { file: "", start: "1", end: "1", severity: "CRITICAL", category: "security", title: "" };
}

/** Keys the form can show (and therefore round-trip) per case kind. */
const LOCATION_KEYS = ["file", "start_line", "end_line"] as const;
const FINDING_KEYS = [...LOCATION_KEYS, "severity", "category", "title"] as const;

const keysFor = (kind: EvalCaseKind): readonly string[] => (kind === "must_find" ? FINDING_KEYS : LOCATION_KEYS);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Map a stored/pasted `expected_output` to form rows. `lossy` is true when the
 * form cannot represent it faithfully (not an array, a non-object entry, a
 * field the form has no input for, or a value of the wrong type) — callers use
 * it to open in Advanced mode and to confirm before discarding data.
 */
export function entriesFromExpected(expected: unknown, kind: EvalCaseKind): { entries: EntryDraft[]; lossy: boolean } {
  if (expected == null) return { entries: [], lossy: false };
  if (!Array.isArray(expected)) return { entries: [], lossy: true };
  const allowed = keysFor(kind);
  let lossy = false;
  const entries = expected.flatMap((raw): EntryDraft[] => {
    if (!isRecord(raw)) {
      lossy = true;
      return [];
    }
    if (Object.keys(raw).some((k) => !allowed.includes(k))) lossy = true;
    const base = emptyEntry();
    const file = typeof raw.file === "string" ? raw.file : "";
    if (typeof raw.file !== "string") lossy = true;
    const startOk = typeof raw.start_line === "number";
    if (!startOk) lossy = true;
    const start = startOk ? String(raw.start_line) : "";
    const endOk = typeof raw.end_line === "number";
    if (raw.end_line !== undefined && !endOk) lossy = true;
    const end = endOk ? String(raw.end_line) : start;
    const sev = SEVERITIES.find((x) => x === raw.severity);
    const cat = CATEGORIES.find((x) => x === raw.category);
    if (kind === "must_find") {
      if (raw.severity !== undefined && !sev) lossy = true;
      if (raw.category !== undefined && !cat) lossy = true;
      if (raw.title !== undefined && typeof raw.title !== "string") lossy = true;
    }
    return [
      {
        ...base,
        file,
        start,
        end,
        severity: sev ?? base.severity,
        category: cat ?? base.category,
        title: typeof raw.title === "string" ? raw.title : "",
      },
    ];
  });
  return { entries, lossy };
}

/** Form rows → the `expected_output` shape the server already accepts. */
export function expectedFromEntries(entries: readonly EntryDraft[], kind: EvalCaseKind): unknown[] {
  return entries.map((e) => {
    const location = { file: e.file, start_line: Number(e.start), end_line: Number(e.end) };
    return kind === "must_find"
      ? { severity: e.severity, category: e.category, title: e.title, ...location }
      : location;
  });
}

const isPositiveInt = (v: string) => /^\d+$/.test(v.trim()) && Number(v) >= 1;

export interface EntryErrors {
  start: boolean;
  end: boolean;
  /** Both lines are valid numbers but start > end. */
  range: boolean;
}

/** Field-level validity (AC-51): positive integers, start ≤ end. */
export function entryErrors(e: EntryDraft): EntryErrors {
  const start = !isPositiveInt(e.start);
  const end = !isPositiveInt(e.end);
  const range = !start && !end && Number(e.start) > Number(e.end);
  return { start, end, range };
}

export function entriesValid(entries: readonly EntryDraft[]): boolean {
  return entries.every((e) => {
    const err = entryErrors(e);
    return !err.start && !err.end && !err.range;
  });
}

/** Non-blocking warning (AC-48): the entry's file or lines aren't in the diff.
 *  Skipped for an empty diff (nothing to compare against) and for invalid lines
 *  (those already block saving). */
export function entryWarning(e: EntryDraft, diff: string, files: readonly ParsedDiffFile[]): "file" | "lines" | null {
  if (!diff.trim() || !e.file.trim()) return null;
  const err = entryErrors(e);
  const { fileFound, linesFound } = locationInDiff(files, e.file.trim(), Number(e.start), Number(e.end));
  if (!fileFound) return "file";
  if (err.start || err.end || err.range) return null;
  return linesFound ? null : "lines";
}
