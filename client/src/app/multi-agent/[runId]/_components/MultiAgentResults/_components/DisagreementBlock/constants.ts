import type { ConflictTake } from "@devdigest/shared";

/** Text colour of a flagged (severity) verdict. */
export const VERDICT_CLASS: Record<string, string> = {
  CRITICAL: "text-crit",
  WARNING: "text-warn",
  SUGGESTION: "text-sugg",
};

export const NEUTRAL_VERDICT_CLASS = "text-subtle-foreground";

export type NonSeverityVerdict = Exclude<ConflictTake["verdict"], "CRITICAL" | "WARNING" | "SUGGESTION">;

/** Maps a non-severity verdict to its `multiAgent.disagree.cell.*` key. */
export const CELL_KEY: Record<NonSeverityVerdict, "notFlagged" | "failed" | "cancelled" | "pending"> = {
  not_flagged: "notFlagged",
  failed: "failed",
  cancelled: "cancelled",
  pending: "pending",
};
