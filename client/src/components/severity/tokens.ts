import type { IconName } from "@/components/icon";

export type Severity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";
export type Category = "bug" | "security" | "perf" | "style" | "test";

/** Badge tone (see `ui/badge` variants) and utility classes per severity.
 *  Labels live in `common.severity.<SEVERITY>`. */
export const SEVERITY_STYLE: Record<
  Severity,
  { icon: IconName; tone: "crit" | "warn" | "sugg" | "info"; text: string; bg: string; fill: string; border: string }
> = {
  CRITICAL: { icon: "AlertOctagon", tone: "crit", text: "text-crit", bg: "bg-crit-bg", fill: "bg-crit", border: "border-crit" },
  WARNING: { icon: "AlertTriangle", tone: "warn", text: "text-warn", bg: "bg-warn-bg", fill: "bg-warn", border: "border-warn" },
  SUGGESTION: { icon: "Lightbulb", tone: "sugg", text: "text-sugg", bg: "bg-sugg-bg", fill: "bg-sugg", border: "border-sugg" },
  INFO: { icon: "Info", tone: "info", text: "text-info", bg: "bg-info-bg", fill: "bg-info", border: "border-info" },
};

/**
 * Legacy shape kept for call sites not yet migrated off inline styles:
 * `c`/`bg` are CSS-variable strings, `label` is untranslated.
 * @deprecated use SEVERITY_STYLE + `common.severity.*`.
 */
export const SEV: Record<Severity, { c: string; bg: string; icon: IconName; label: string }> = {
  CRITICAL: { c: "var(--crit)", bg: "var(--crit-bg)", icon: "AlertOctagon", label: "Critical" },
  WARNING: { c: "var(--warn)", bg: "var(--warn-bg)", icon: "AlertTriangle", label: "Warning" },
  SUGGESTION: { c: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb", label: "Suggestion" },
  INFO: { c: "var(--info)", bg: "var(--info-bg)", icon: "Info", label: "Info" },
};

/** Icon per finding category. Labels live in `common.category.<category>`. */
export const CATEGORY_ICON: Record<Category, IconName> = {
  bug: "Bug",
  security: "Shield",
  perf: "Zap",
  style: "Code",
  test: "FlaskConical",
};

/** @deprecated legacy shape — use CATEGORY_ICON + `common.category.*`. */
export const CAT: Record<Category, { icon: IconName; label: string }> = {
  bug: { icon: "Bug", label: "bug" },
  security: { icon: "Shield", label: "security" },
  perf: { icon: "Zap", label: "perf" },
  style: { icon: "Code", label: "style" },
  test: { icon: "FlaskConical", label: "test" },
};
