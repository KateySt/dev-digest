/** Constants for the DiffViewer. */
import type { SmartDiffRole, Severity } from "@/lib/types";

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * "Smart order" group render order. Presentation-only — the server's own
 * `smart-diff/constants.ts#ROLE_ORDER` is the one that matters for
 * classification; this is just so the client renders groups in the same
 * order even if the API ever returned them out of order.
 */
export const ROLE_ORDER: readonly SmartDiffRole[] = ["core", "tests", "wiring", "docs", "boilerplate"];

/** i18n key (under `prReview.smartDiff`) for each role's group-header label. */
export const ROLE_LABEL_KEYS: Record<SmartDiffRole, string> = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
};

/** Roles whose group starts collapsed regardless of size — low-signal for
 *  review (generated/vendored diffs, docs prose). */
export const DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

/** i18n key (under `prReview.diffFindings`) for each severity's inline label
 *  (deliberately NOT the same copy as `SEV[severity].label` in
 *  `@devdigest/ui` — that's "Critical/Warning/Suggestion", this is the
 *  reviewer-facing "blocker/warning/suggestion" wording). */
export const SEVERITY_LABEL_KEYS: Record<Severity, string> = {
  CRITICAL: "severityBlocker",
  WARNING: "severityWarning",
  SUGGESTION: "severitySuggestion",
};
