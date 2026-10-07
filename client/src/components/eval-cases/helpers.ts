import type { EvalCaseKind, EvalCaseRun } from "@devdigest/shared";
import { actualCount, caseLocations, formatLocation } from "@/lib/eval";

/** Try to parse `text` as JSON; returns null on failure (drives the
 *  valid/invalid JSON badge). */
export function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const FINDING_SKELETON = {
  severity: "CRITICAL",
  category: "security",
  title: "…",
  file: "src/example.ts",
  start_line: 1,
};

/** A forbidden location of a `must_not_flag` case. */
const LOCATION_SKELETON = { file: "src/example.ts", start_line: 1, end_line: 1 };

function appendTo(text: string, entry: object): string {
  const parsed = tryParseJson(text);
  const arr = Array.isArray(parsed) ? parsed : [];
  arr.push({ ...entry });
  return JSON.stringify(arr, null, 2);
}

/** Append a finding skeleton to the expected-output JSON array. Starts a
 *  fresh array when the current text isn't already a valid JSON array. */
export function addFindingSkeleton(text: string): string {
  return appendTo(text, FINDING_SKELETON);
}

/** Append a `{file, start_line, end_line}` skeleton (must-not-flag cases). */
export function addLocationSkeleton(text: string): string {
  return appendTo(text, LOCATION_SKELETON);
}

/** What a case row/banner says about a case's latest result (rendered via i18n). */
export type CaseSummary =
  | { kind: "neverRun" }
  | { kind: "errored"; message: string }
  | { kind: "mustFind"; expected: number; got: number }
  | { kind: "mustNotFlag"; got: number; locations: string | null };

export function summarizeCase(
  caseKind: EvalCaseKind,
  expectedOutput: unknown,
  run: EvalCaseRun | null | undefined,
): CaseSummary {
  if (!run) return { kind: "neverRun" };
  if (run.status === "errored") return { kind: "errored", message: run.error ?? "" };
  const got = actualCount(run.actual_output);
  const locs = caseLocations(expectedOutput);
  if (caseKind === "must_not_flag") {
    return { kind: "mustNotFlag", got, locations: locs.length > 0 ? locs.map(formatLocation).join(", ") : null };
  }
  return { kind: "mustFind", expected: locs.length, got };
}

/** The right-hand chip of a case row: "SEVERITY · category" for a must-find
 *  case's first expected finding, the literal `empty []` for a must-not-flag case
 *  with no forbidden locations, otherwise nothing. */
export function caseChip(
  caseKind: EvalCaseKind,
  expectedOutput: unknown,
): { kind: "finding"; text: string } | { kind: "empty" } | null {
  if (caseKind === "must_not_flag") {
    return caseLocations(expectedOutput).length === 0 ? { kind: "empty" } : null;
  }
  const first = Array.isArray(expectedOutput) ? (expectedOutput[0] as { severity?: unknown; category?: unknown } | undefined) : undefined;
  if (!first || typeof first.severity !== "string") return null;
  const category = typeof first.category === "string" ? ` · ${first.category}` : "";
  return { kind: "finding", text: `${first.severity.toUpperCase()}${category}` };
}
