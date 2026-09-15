import type { ReviewRecord, Severity } from "@devdigest/shared";

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export function sortBySeverity<T extends { severity: string }>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity as Severity] ?? 9) - (SEVERITY_ORDER[b.severity as Severity] ?? 9),
  );
}

/** Tally a finding list by severity — the shape both the PR-list badge column
    and the Agent-runs timeline badges render (icon + count per severity). */
export function countBySeverity(findings: { severity: string }[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL" || f.severity === "WARNING" || f.severity === "SUGGESTION") {
      counts[f.severity] += 1;
    }
  }
  return counts;
}

/**
 * The most recent `kind: 'review'` record, or undefined if none. Matches the
 * backend's "latest review per PR" selection (server/src/modules/pulls/routes.ts)
 * so a PR-list tooltip's findings stay consistent with the badge counts
 * computed server-side from that same review.
 */
export function latestReview(reviews: ReviewRecord[]): ReviewRecord | undefined {
  return reviews
    .filter((r) => r.kind === "review")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
}
