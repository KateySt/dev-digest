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

/** i18n key (under `prReview.smartDiff`) for each role's one-line description,
 *  shown next to the label in the group header. */
export const ROLE_DESCRIPTION_KEYS: Record<SmartDiffRole, string> = {
  core: "coreLabelDescription",
  tests: "testsLabelDescription",
  wiring: "wiringLabelDescription",
  docs: "docsLabelDescription",
  boilerplate: "boilerplateLabelDescription",
};

/** i18n key (under `prReview.diffFindings`) for each severity's inline label
 *  (deliberately NOT the same copy as `common.severity.*` — that's "Critical/Warning/Suggestion", this is the
 *  reviewer-facing "blocker/warning/suggestion" wording). */
export const SEVERITY_LABEL_KEYS: Record<Severity, string> = {
  CRITICAL: "severityBlocker",
  WARNING: "severityWarning",
  SUGGESTION: "severitySuggestion",
};

/* ---- shared class strings ---- */

/** Indented rail for threads/composer/findings, aligned under the code (past
 *  the 58px gutter). */
export const RAIL = "mt-1.5 mr-3.5 mb-2 ml-14.5 flex flex-col gap-2";
/** Rail variant for inline findings (tighter stack). */
export const FINDING_BLOCK = "mt-1.5 mr-3.5 mb-2 ml-14.5 flex flex-col gap-1";
export const SEVERITY_LABEL = "text-2xs font-bold tracking-[0.06em] uppercase";
/** Review-comment card chrome (CommentCard, RiskAnnotationCard). */
export const COMMENT_CARD = "rounded-lg border border-border bg-elevated p-(--card-pad)";
export const COMMENT_HEAD = "mb-1.5 flex items-center gap-2";
export const COMMENT_USER = "text-sm font-semibold text-foreground";
export const COMMENT_META = "text-[11.5px] text-subtle-foreground";
export const COMMENT_BODY = "text-sm leading-[19px] break-words text-muted-foreground";
export const COMPOSER_ACTIONS = "mt-2 flex items-center gap-2";
/** Expand/collapse chevron; add `rotate-90` when open. */
export const CHEVRON = "text-subtle-foreground transition-transform duration-120";
