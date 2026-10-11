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

/** SPEC-05 — bulk "Review all" guardrail: a hard cap above which the trigger
 *  refuses outright (S-AC-5) rather than truncating. Concurrency is no longer
 *  bounded here: every run enters the shared review queue (`REVIEW_CONCURRENCY`,
 *  default 3, which keeps SPEC-05 S-AC-7's "at most 3 at once"). */
export const BULK_REVIEW_MAX_PRS = 20;
