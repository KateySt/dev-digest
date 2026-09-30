import { z } from 'zod';

/**
 * SPEC-06 — Onboarding Tour contract. The response shape for the per-repo
 * onboarding tour: `GET /repos/:id/onboarding` reads it, `POST
 * /repos/:id/onboarding/generate` (re)writes it via a background job.
 *
 * Field-level rule (server/INSIGHTS.md, client/INSIGHTS.md): everything
 * DETERMINISTIC (collected from `repo-intel` + the clone, no model
 * involved) is required and present even on a degraded tour (S-AC-26,
 * C-AC-27). Everything MODEL-AUTHORED is `.nullish()` — a degraded tour
 * (S-AC-24, model call failed) persists the deterministic skeleton with
 * every prose field absent, so a required model field would break that
 * skeleton at the type level the first time it's actually exercised.
 *
 * Degradation is two INDEPENDENT nullable fields, never one shared enum —
 * S-AC-23 (index degraded) and S-AC-24 (model call failed) can both be true
 * of the same run (C-AC-26 requires the client to distinguish them and
 * render both banners at once), so collapsing them into one reason would
 * make that impossible to express. There is deliberately no derived
 * `degraded: boolean` field either — the client derives its own
 * presentation from these two fields so the contract can never
 * self-contradict a derived flag.
 */

// ---- Degradation reasons ---------------------------------------------------

/** Mirrors `repo-intel`'s `IndexStatus` (server/modules/repo-intel/types.ts)
 *  duplicated here rather than imported — this contract is vendored
 *  byte-identical into `client/src/vendor/shared`, which has no
 *  `repo-intel` module to import from. */
export const OnboardingIndexStatus = z.enum(['full', 'partial', 'degraded', 'failed']);
export type OnboardingIndexStatus = z.infer<typeof OnboardingIndexStatus>;

/** Mirrors `repo-intel`'s `DegradedReason`, same duplication rationale. */
export const OnboardingIndexDegradedReason = z.enum([
  'index_partial',
  'repo_too_large',
  'flag_off',
  'index_failed',
  'no_data',
]);
export type OnboardingIndexDegradedReason = z.infer<typeof OnboardingIndexDegradedReason>;

export const OnboardingModelFailureReason = z.enum(['call_failed', 'timeout', 'invalid_response']);
export type OnboardingModelFailureReason = z.infer<typeof OnboardingModelFailureReason>;

// ---- Deterministic facts ---------------------------------------------------

export const OnboardingReadingPathEntry = z.object({
  position: z.number().int(),
  path: z.string(),
  /** Model-authored one-line rationale, index-aligned with this entry —
   *  null when the model never ran or the arrays didn't align (server
   *  service.ts zips defensively rather than discarding the tour). */
  rationale: z.string().nullable(),
});
export type OnboardingReadingPathEntry = z.infer<typeof OnboardingReadingPathEntry>;

export const OnboardingCriticalPathEntry = z.object({
  /** Dependency chain, importer → imported, e.g. ["a.ts", "b.ts", "c.ts"]. */
  chain: z.array(z.string()).min(2),
  reason: z.string().nullable(),
});
export type OnboardingCriticalPathEntry = z.infer<typeof OnboardingCriticalPathEntry>;

export const OnboardingRunCommandSource = z.enum(['package_json', 'compose', 'env_example']);
export type OnboardingRunCommandSource = z.infer<typeof OnboardingRunCommandSource>;

export const OnboardingRunCommand = z.object({
  order: z.number().int(),
  command: z.string(),
  source: OnboardingRunCommandSource,
});
export type OnboardingRunCommand = z.infer<typeof OnboardingRunCommand>;

export const OnboardingDiagramEdge = z.object({
  from: z.string(),
  to: z.string(),
});
export type OnboardingDiagramEdge = z.infer<typeof OnboardingDiagramEdge>;

// ---- The tour ---------------------------------------------------------------

export const OnboardingTour = z.object({
  // -- Degradation (two independent fields — see header comment) --
  index_status: OnboardingIndexStatus,
  index_degraded_reason: OnboardingIndexDegradedReason.nullish(),
  model_failure_reason: OnboardingModelFailureReason.nullish(),

  // -- Index honesty (S-AC-15 / C-AC-4, C-AC-5) --
  files_indexed: z.number().int(),
  files_discovered: z.number().int(),

  // -- Provenance --
  generated_at: z.string(),
  /** Idempotency key (S-AC-16/S-AC-7 job-scoped dedup) — the job id that
   *  most recently (re)wrote this row. */
  generated_by_job_id: z.string().nullish(),
  blob_ref: z.string(),
  blob_ref_kind: z.enum(['sha', 'branch']),
  /** Bumped whenever this JSON shape changes — the `json` column is
   *  schemaless at rest, so this is how a future shape change is detected. */
  schema_version: z.number().int(),

  // -- Cost accounting (S-AC-21) — absent when the model never ran --
  tokens_in: z.number().nullish(),
  tokens_out: z.number().nullish(),
  cost_usd: z.number().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),

  // -- Deterministic facts — always present, even on a degraded tour --
  reading_path: z.array(OnboardingReadingPathEntry),
  critical_paths: z.array(OnboardingCriticalPathEntry),
  run_commands: z.array(OnboardingRunCommand),
  env_keys: z.array(z.string()),
  diagram_nodes: z.array(z.string()),
  diagram_edges: z.array(OnboardingDiagramEdge),

  // -- Model-authored prose — absent on the S-AC-24 skeleton --
  architecture_md: z.string().nullish(),
  critical_paths_md: z.string().nullish(),
  run_locally_md: z.string().nullish(),
  reading_path_md: z.string().nullish(),
  first_tasks_md: z.string().nullish(),
  diagram_source: z.string().nullish(),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

// ---- HTTP surface -----------------------------------------------------------

/** `GET /repos/:id/onboarding` when no tour has ever been generated
 *  (S-AC-1 / C-AC-19) — not an error. */
export const OnboardingNotGenerated = z.object({
  state: z.literal('not_generated'),
});
export type OnboardingNotGenerated = z.infer<typeof OnboardingNotGenerated>;

/** `GET /repos/:id/onboarding` when the repo has no clone on disk
 *  (S-AC-22 / C-AC-25) — not generatable, not an error. */
export const OnboardingNoClone = z.object({
  state: z.literal('no_clone'),
});
export type OnboardingNoClone = z.infer<typeof OnboardingNoClone>;

export const OnboardingReadResponse = z.union([
  OnboardingTour.extend({ state: z.literal('generated') }),
  OnboardingNotGenerated,
  OnboardingNoClone,
]);
export type OnboardingReadResponse = z.infer<typeof OnboardingReadResponse>;

/** `POST /repos/:id/onboarding/generate` — mirrors `POST /repos/:id/resync`'s
 *  always-202 shape (S-AC-2, S-AC-3, S-AC-6). */
export const OnboardingGenerateAccepted = z.object({
  status: z.literal('accepted'),
  jobId: z.string().nullish(),
  degraded: z.boolean().nullish(),
  reason: z.string().nullish(),
});
export type OnboardingGenerateAccepted = z.infer<typeof OnboardingGenerateAccepted>;
