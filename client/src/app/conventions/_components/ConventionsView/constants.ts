import type { ConventionCategory } from "@devdigest/shared";

/** Badge color per convention category — same palette family as the Skills
 *  Lab's SKILL_TYPE_COLOR, just extended to 8 buckets. */
export const CONVENTION_CATEGORY_COLOR: Record<ConventionCategory, string> = {
  naming: "var(--accent)",
  structure: "var(--ok)",
  errors: "var(--crit)",
  testing: "var(--warn)",
  imports: "var(--text-secondary)",
  typing: "var(--accent)",
  api: "var(--crit)",
  general: "var(--text-secondary)",
};
