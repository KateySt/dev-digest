/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/** SPEC-05 — bulk "Review all" guardrails: a hard cap above which the
 *  trigger refuses outright (S-AC-5) rather than truncating, and a bounded
 *  concurrency across the batch's PR executions (S-AC-7). Each PR's own
 *  agents already run sequentially (`ReviewRunExecutor.executeRuns`'s `for`
 *  loop), so bounding at the PR level here keeps total concurrent runs at
 *  or below this limit without a second, nested limiter. */
export const BULK_REVIEW_MAX_PRS = 20;
export const BULK_REVIEW_CONCURRENCY = 3;
