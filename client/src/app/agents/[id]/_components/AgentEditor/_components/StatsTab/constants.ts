import type { Severity } from "@devdigest/shared";

/** Bar color per severity — matches the findings-taxonomy colors used
 *  elsewhere (SeverityBadge/CategoryTag in @devdigest/ui). */
export const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--accent)",
};

export const SEVERITY_ORDER: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export const DEFAULT_RUNS_LIMIT = 20;
