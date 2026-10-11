import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, EvalCaseKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
  /** Defaults to must_find when omitted; manual cases are always source manual. */
  kind: EvalCaseKind.optional(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`buildManifestYaml` in the ci module) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

export const AgentManifest = z.object({
  manifest_version: z.number().int().default(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
  post_as: CiPostAs.default('github_review'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/ci/{preview,export,zip}`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: CiPostAs.default('github_review'),
  triggers: z.array(CiTrigger).min(1).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
  /** User-edited workflow text (linted server-side; replaces the generated one). */
  workflow_yaml: z.string().max(200_000).nullish(),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
  github_repo_id: z.number().nullish(),
  branch: z.string().nullish(),
  workflow_path: z.string().nullish(),
  workflow_version: z.number().int().nullish(),
  manifest_version: z.number().int().nullish(),
  exported_ci_fail_on: z.string().nullish(),
  post_as: z.string().nullish(),
  triggers: z.array(z.string()).nullish(),
  pr_url: z.string().nullish(),
  last_synced_at: z.string().nullish(),
  out_of_date: z.boolean().nullish(),
  last_run_status: z.string().nullish(),
  last_run_at: z.string().nullish(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/ci/export`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

/** Metadata describing the bundled runner (its body is never sent to the client). */
export const CiRunnerMeta = z.object({
  size_bytes: z.number().int(),
  runner_version: z.string(),
  sha256: z.string(),
});
export type CiRunnerMeta = z.infer<typeof CiRunnerMeta>;

/** One file in a preview; the runner entry has empty contents + `metadata`. */
export const CiPreviewFile = CiFile.extend({
  metadata: CiRunnerMeta.nullish(),
});
export type CiPreviewFile = z.infer<typeof CiPreviewFile>;

/** Response of `POST /agents/:id/ci/preview` (no side effects). */
export const CiPreview = z.object({
  files: z.array(CiPreviewFile),
  warnings: z.array(z.string()),
});
export type CiPreview = z.infer<typeof CiPreview>;

/** One blocking workflow-lint violation (422 `details.violations`). */
export const CiLintViolation = z.object({
  rule: z.string(),
  location: z.string(),
  message: z.string(),
});
export type CiLintViolation = z.infer<typeof CiLintViolation>;

/** Response of `POST /ci-runs/sync`. */
export const CiSyncResult = z.object({
  ingested: z.number().int(),
  failed: z.number().int(),
  skipped: z.number().int(),
  throttled: z.boolean(),
});
export type CiSyncResult = z.infer<typeof CiSyncResult>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  repo: z.string().nullish(),
  pr_title: z.string().nullish(),
  pr_url: z.string().nullish(),
  duration_ms: z.number().int().nullish(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  verdict: z.string().nullish(),
  ingest_error: z.string().nullish(),
  agent_run_id: z.string().nullish(),
  job_url: z.string().nullish(),
  commit_sha: z.string().nullish(),
  workflow_version: z.number().int().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Response of `GET /agents/:id/ci`. */
export const AgentCiOverview = z.object({
  installations: z.array(CiInstallation),
  recent_runs: z.array(CiRun),
});
export type AgentCiOverview = z.infer<typeof AgentCiOverview>;

/**
 * The artifact shape uploaded by the CI runner (`devdigest-result.json`).
 * Pulled back by the studio on sync and verified against GitHub's run metadata
 * before anything is persisted. `.strict()`: unknown keys are rejected.
 */
export const CiResultArtifact = z
  .object({
    schema_version: z.number().int().nonnegative().max(1000),
    findings_count: z.number().int().nonnegative().max(10_000),
    critical: z.number().int().nonnegative().max(10_000).nullish(),
    warning: z.number().int().nonnegative().max(10_000).nullish(),
    suggestion: z.number().int().nonnegative().max(10_000).nullish(),
    cost_usd: z.number().nonnegative().max(1000).nullable(),
    duration_ms: z.number().int().nonnegative().max(86_400_000).nullish(),
    agent: z.string().max(200),
    agent_slug: z.string().max(200),
    version: z.string().max(200).nullish(),
    pr_number: z.number().int().nonnegative().nullish(),
    repository: z.string().max(200).regex(/^[^/\s]+\/[^/\s]+$/),
    repository_id: z.number().int().nonnegative(),
    commit_sha: z.string().regex(/^[0-9a-f]{40}$/),
    run_id: z.number().int().nonnegative(),
    run_attempt: z.number().int().nonnegative().max(10_000),
    verdict: Verdict,
    blockers: z.number().int().nonnegative().max(10_000),
    gate_triggered: z.boolean(),
    model: z.string().max(200),
    manifest_version: z.number().int().nonnegative().max(1000),
    dependencies: z
      .object({ runner: z.string().max(200), node: z.string().max(200) })
      .strict(),
  })
  .strict();
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
