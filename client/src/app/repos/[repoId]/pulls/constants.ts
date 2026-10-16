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
 *  per-row Run Review dropdown, keeping header and rows aligned. */
export const GRID_COLS = "grid-cols-[1fr_132px_92px_60px_108px_118px_72px_78px_140px]";

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
