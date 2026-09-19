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

/** Append a finding skeleton to the expected-output JSON array. Starts a
 *  fresh array when the current text isn't already a valid JSON array. */
export function addFindingSkeleton(text: string): string {
  const parsed = tryParseJson(text);
  const arr = Array.isArray(parsed) ? parsed : [];
  arr.push({ ...FINDING_SKELETON });
  return JSON.stringify(arr, null, 2);
}
