/** Constants for FindingCard. */

/** Severity → card accent classes: `edge` colours the 3px left border,
 *  `focus` colours the whole border + 1px ring while the card is focused. */
export const SEV_ACCENT: Record<string, { edge: string; focus: string }> = {
  CRITICAL: { edge: "border-l-crit", focus: "border-crit ring-crit" },
  WARNING: { edge: "border-l-warn", focus: "border-warn ring-warn" },
  SUGGESTION: { edge: "border-l-sugg", focus: "border-sugg ring-sugg" },
  INFO: { edge: "border-l-info", focus: "border-info ring-info" },
};

/** Accent for an unknown severity. */
export const SEV_ACCENT_FALLBACK = { edge: "border-l-subtle-foreground", focus: "border-subtle-foreground ring-subtle-foreground" };

/** Shared look for the small accent links in the card ("View eval case", "Posted"). */
export const INLINE_LINK = "inline-flex items-center px-1 text-ui font-semibold text-primary no-underline";

/** "In eval set" outlined link chip. */
export const EVAL_SET_LINK =
  "inline-flex items-center rounded-md border border-primary px-2.25 py-1.25 text-ui font-medium text-primary no-underline";
