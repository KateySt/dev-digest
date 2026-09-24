import type { IconName } from "@devdigest/ui";

/** Risk.kind (contract: `z.string()`, not a closed enum) as this UI actually
 *  narrows it — anything not in this set falls back to "other" at the call
 *  site (see RiskAreasList.tsx). */
export type RiskKind = "security" | "dependency" | "performance" | "reliability" | "other";

export const KIND_ICON: Record<RiskKind, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  reliability: "Activity",
  other: "AlertOctagon",
};

/**
 * Row icon/accent color per risk *kind* (not severity — every risk kind can
 * occur at any severity, so severity-coloring rows made every "high" row the
 * same red regardless of what it actually was). security/performance reuse
 * the shared crit/warn tokens; reliability/other fall back to the existing
 * muted text color. dependency has no matching token in the vendored theme
 * (`src/vendor/ui/styles.css` only defines crit/warn/ok/muted, no purple) —
 * literal hex chosen to read as a distinct purple/pink against the dark
 * background, same justified-literal pattern as
 * `CommitHistoryPanel/constants.ts`'s `FILE_SEVERITY_COLOR.SUGGESTION`.
 */
export const KIND_COLOR: Record<RiskKind, string> = {
  security: "var(--crit)",
  performance: "var(--warn)",
  reliability: "var(--text-muted)",
  other: "var(--text-muted)",
  dependency: "#c297ff",
};
