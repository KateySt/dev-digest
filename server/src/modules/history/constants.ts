/**
 * Safety cap on how many prior PRs "touching these files" get returned.
 * Bounds the query for churny repos where many merged/closed PRs could
 * overlap the current PR's changed files — by analogy to
 * `modules/pulls/routes.ts`'s `BACKFILL_LIMIT`, not derived from an existing
 * "history" precedent, so worth a sanity check in review (not blocking).
 */
export const HISTORY_LIMIT = 10;
