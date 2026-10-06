import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import { Intent, SmartDiff } from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
  /** Eval case seeded from this finding, if any. `.nullish()` — older payloads omit it. */
  eval_case_id: z.string().nullish(),
  /** GitHub comment URL / time of a studio-posted "Reply to author". */
  reply_url: z.string().nullish(),
  replied_at: z.string().nullish(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/**
 * SPEC-05 — a repo's `needs_review` bulk-review trigger + its pre-flight cost
 * estimate. Both derive the same set the same way (S-AC-16), so the count a
 * user confirms and the set that actually fires never differ in kind.
 */

/** GET .../pulls/review-estimate response — what "Review all" would cost,
 *  computed from history, never from a fresh token/diff analysis. */
export const ReviewEstimate = z.object({
  pr_count: z.number().int(),
  agent_count: z.number().int(),
  run_count: z.number().int(),
  /** Null when that repo has no completed run with a recorded cost yet
   *  (S-AC-14) — the client renders "no history" rather than `$0.00`. */
  approx_cost_usd: z.number().nullable(),
  /** Always true — the figure is a historical mean, never an exact price
   *  (S-AC-15). Present so a client can't accidentally render it as exact. */
  approximate: z.literal(true),
  /** PRs in the needs_review set that already have a run in flight and would
   *  be skipped rather than duplicated (S-AC-4). */
  skip_count: z.number().int(),
});
export type ReviewEstimate = z.infer<typeof ReviewEstimate>;

/** One PR's outcome from a bulk trigger — never collapsed into one status
 *  code (S-AC-3). `run_ids` is populated only for `started`. */
export const BulkReviewOutcome = z.object({
  pr_id: z.string(),
  outcome: z.enum(['started', 'skipped', 'failed']),
  run_ids: z.array(z.string()),
  /** Present for `skipped` (why) and `failed` (the error). */
  reason: z.string().nullish(),
});
export type BulkReviewOutcome = z.infer<typeof BulkReviewOutcome>;

export const BulkReviewResponse = z.object({
  results: z.array(BulkReviewOutcome),
});
export type BulkReviewResponse = z.infer<typeof BulkReviewResponse>;

/** Intent persisted for a PR (the Intent plus the pr_id it scopes). */
export const PrIntentRecord = Intent.extend({ pr_id: z.string() });
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;
