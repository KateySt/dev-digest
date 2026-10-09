/** Cycled colors for Donut segments — `PerfCostSegment` has no color field
 *  (it's `{label, value}` only), so segments are colored by index. */
export const SEGMENT_COLORS = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "var(--text-secondary)",
  "#8b5cf6",
];

export type SortKey = "acceptRate" | "runs" | "cost";
export const SORT_KEYS: SortKey[] = ["runs", "acceptRate", "cost"];
