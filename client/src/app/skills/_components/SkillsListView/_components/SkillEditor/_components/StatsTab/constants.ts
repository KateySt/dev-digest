import type { Category } from "@devdigest/ui";

/** Donut segment color per finding category — matches the taxonomy colors
 *  used elsewhere (CategoryTag in @devdigest/ui). Falls back to
 *  `FALLBACK_CATEGORY_COLOR` for a category outside the known set (findings
 *  store category as free text, not a DB-level enum). */
export const CATEGORY_COLOR: Record<Category, string> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--accent)",
  style: "var(--ok)",
  test: "var(--text-secondary)",
};

export const FALLBACK_CATEGORY_COLOR = "var(--text-muted)";
