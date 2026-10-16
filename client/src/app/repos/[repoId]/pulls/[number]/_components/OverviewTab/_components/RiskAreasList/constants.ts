import type { IconName } from "@/components/icon";

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
 * muted text color. dependency has no matching theme token (globals.css only
 * defines crit/warn/ok/muted, no purple) — a literal hex chosen to read as a
 * distinct purple/pink against the dark background, same justified-literal
 * pattern as `CommitHistoryPanel/constants.ts`'s SUGGESTION colour.
 * `text` colours the icon; `border` outlines the row while it is open.
 */
export const KIND_COLOR: Record<RiskKind, { text: string; border: string }> = {
  security: { text: "text-crit", border: "border-crit" },
  performance: { text: "text-warn", border: "border-warn" },
  reliability: { text: "text-subtle-foreground", border: "border-subtle-foreground" },
  other: { text: "text-subtle-foreground", border: "border-subtle-foreground" },
  dependency: { text: "text-[#c297ff]", border: "border-[#c297ff]" },
};
