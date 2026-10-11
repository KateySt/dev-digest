/** Used until GET /multi-agent-runs/estimates reports the server's REVIEW_CONCURRENCY. */
export const DEFAULT_CONCURRENCY = 3;

/** PR statuses that are no longer open for review. */
export const CLOSED_PR_STATUSES: readonly string[] = ["closed", "merged"];
