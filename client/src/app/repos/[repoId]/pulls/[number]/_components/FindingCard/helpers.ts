import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** The kind of eval case a decided finding becomes: accepted → must find,
 *  dismissed → must not flag; null while undecided. */
export function evalKindFor(f: Pick<FindingRecord, "accepted_at" | "dismissed_at">): "must_find" | "must_not_flag" | null {
  if (f.accepted_at) return "must_find";
  if (f.dismissed_at) return "must_not_flag";
  return null;
}

/** Editable reply body prefilled from the finding's title, rationale and
 *  suggestion. The user can change it before confirming; it is posted verbatim. */
export function buildReplyBody(
  f: Pick<FindingRecord, "title" | "rationale" | "suggestion">,
  suggestionHeading: string,
): string {
  const parts = [`**${f.title}**`, f.rationale];
  if (f.suggestion) parts.push(`**${suggestionHeading}**\n${f.suggestion}`);
  return parts.join("\n\n");
}
