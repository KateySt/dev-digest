import type { PrMeta } from "../../../../lib/types";

/** Constants for the PR list page (/repos/:repoId/pulls). */

/**
 * Review status → text/dot colour classes + i18n label key (under
 * `list.status`). Open PRs carry a derived review status (needs_review /
 * reviewed / stale); merged/closed keep their GitHub merge state.
 */
export const STATUS_META: Record<string, { text: string; dot: string; labelKey: string }> = {
  needs_review: { text: "text-warn", dot: "bg-warn", labelKey: "needs_review" },
  reviewed: { text: "text-ok", dot: "bg-ok", labelKey: "reviewed" },
  stale: { text: "text-stale", dot: "bg-stale", labelKey: "stale" },
  open: { text: "text-warn", dot: "bg-warn", labelKey: "open" },
  merged: { text: "text-ok", dot: "bg-ok", labelKey: "merged" },
  closed: { text: "text-stale", dot: "bg-stale", labelKey: "closed" },
};

/** Size bucket → outline badge colour classes. */
export const SIZE_CLASS: Record<string, string> = {
  S: "border-ok text-ok",
  M: "border-warn text-warn",
  L: "border-crit text-crit",
};

/** Grid columns shared by the header row and every PR row. SPEC-05
 *  C-AC-11/31 appends a fixed-width "actions" column for the permanent
 *  per-row Run Review dropdown, keeping header and rows aligned. The title
 *  column never shrinks below 150px (author below 100px) — on a narrower
 *  window the table scrolls sideways instead of collapsing the title.
 *
 *  Narrow tables (< PR_TABLE_WIDE of the `prs` container — the 1024px desktop
 *  window) drop the Cost and Updated columns; the updated time moves under
 *  the title instead (see WIDE_ONLY). */
export const GRID_COLS =
  "grid-cols-[minmax(150px,1fr)_minmax(100px,132px)_92px_60px_108px_118px_140px] @min-[1100px]/prs:grid-cols-[minmax(150px,1fr)_minmax(100px,132px)_92px_60px_108px_118px_72px_78px_140px]";

/** Cells shown only in the wide table (Cost, Updated). */
export const WIDE_ONLY = "hidden @min-[1100px]/prs:block";
/** The narrow table's stand-in for the Updated column. */
export const NARROW_ONLY = "@min-[1100px]/prs:hidden";
export const WIDE_ONLY_COLUMNS = new Set(["cost", "updated"]);

/** Line-count thresholds for the S/M/L size bucket. */
export const SIZE_SMALL_MAX = 100;
export const SIZE_MEDIUM_MAX = 400;

/** Filter chips: status key + i18n label key (under `list.filter`). */
export const STATUS_FILTERS: { key: string; labelKey: string }[] = [
  { key: "all", labelKey: "all" },
  { key: "needs_review", labelKey: "needs_review" },
  { key: "reviewed", labelKey: "reviewed" },
  { key: "stale", labelKey: "stale" },
];

/** Column header i18n keys (under `list.columns`), in display order. */
export const COLUMN_KEYS: string[] = [
  "pullRequest",
  "author",
  "size",
  "score",
  "findings",
  "status",
  "cost",
  "updated",
  "actions",
];

/** Number of skeleton rows shown while loading. */
export const SKELETON_ROWS = 4;

export type PrSize = "S" | "M" | "L";
export type SizeInfo = { size: PrSize; lines: number };

/** Re-exported for helpers that consume PrMeta. */
export type { PrMeta };
