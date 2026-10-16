import type { SkillScanSeverity, SkillType } from "@devdigest/shared";

/** Badge color per skill type — matches the reference design (blue rubric,
 *  green convention, red security, gray custom). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/** Badge color per content-scan finding severity. */
export const SCAN_SEVERITY_COLOR: Record<SkillScanSeverity, string> = {
  critical: "var(--crit)",
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-secondary)",
};

/** Badge variant (`ui/badge`) per skill type — same palette as SKILL_TYPE_COLOR. */
export const SKILL_TYPE_BADGE: Record<SkillType, "brand" | "ok" | "crit" | "neutral"> = {
  rubric: "brand",
  convention: "ok",
  security: "crit",
  custom: "neutral",
};

/** Badge variant (`ui/badge`) per content-scan finding severity. */
export const SCAN_SEVERITY_BADGE: Record<SkillScanSeverity, "crit" | "warn" | "neutral"> = {
  critical: "crit",
  high: "crit",
  medium: "warn",
  low: "neutral",
};

export const SKILL_TYPES: SkillType[] = ["rubric", "convention", "security", "custom"];
