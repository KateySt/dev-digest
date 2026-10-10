import type { ConflictTake } from "@devdigest/shared";

export const VERDICT_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--sugg)",
};

export const NEUTRAL_VERDICT_COLOR = "var(--text-muted)";

export type NonSeverityVerdict = Exclude<ConflictTake["verdict"], "CRITICAL" | "WARNING" | "SUGGESTION">;

/** Maps a non-severity verdict to its `multiAgent.disagree.cell.*` key. */
export const CELL_KEY: Record<NonSeverityVerdict, "notFlagged" | "failed" | "cancelled" | "pending"> = {
  not_flagged: "notFlagged",
  failed: "failed",
  cancelled: "cancelled",
  pending: "pending",
};
