import type { FindingRecord } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/findings";
import { REVIEW_FOCUS_LIMIT } from "./constants";

/**
 * Selects the "read these first" shortlist for the Review Focus card: drop
 * dismissed findings (same dismissed-exclusion convention as OverviewTab's
 * blocker count — see OverviewTab.tsx), sort by severity (reusing
 * `sortBySeverity` from lib/findings.ts — do not reimplement severity
 * ordering here), then cap at `REVIEW_FOCUS_LIMIT`. Pure function — call
 * during render from props, never cache the result in state.
 */
export function topFindings(findings: FindingRecord[]): FindingRecord[] {
  const active = findings.filter((f) => !f.dismissed_at);
  return sortBySeverity(active).slice(0, REVIEW_FOCUS_LIMIT);
}
