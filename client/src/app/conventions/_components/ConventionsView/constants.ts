import type { ConventionCategory } from "@devdigest/shared";

/** Badge tone per convention category — same palette family as the Skills
 *  Lab's skill-type badges, just extended to 8 buckets. */
export const CONVENTION_CATEGORY_TONE: Record<ConventionCategory, "brand" | "ok" | "crit" | "warn" | "neutral"> = {
  naming: "brand",
  structure: "ok",
  errors: "crit",
  testing: "warn",
  imports: "neutral",
  typing: "brand",
  api: "crit",
  general: "neutral",
};
