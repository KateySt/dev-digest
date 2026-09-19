import type { SkillType } from "@devdigest/shared";

/** Badge color per skill type — matches the reference design (blue rubric,
 *  green convention, red security, gray custom). */
export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};
