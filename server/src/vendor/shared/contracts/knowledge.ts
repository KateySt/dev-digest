import { z } from 'zod';

/**
 * Conformance, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs. The Onboarding Tour contract lives in its own
 * `contracts/onboarding.ts` (SPEC-06) — the legacy `Onboarding`/
 * `OnboardingSection`/`OnboardingLink` placeholders that used to live here
 * had zero consumers anywhere in the repo and were removed.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

/** One `eval_runs` row — the result of running a SINGLE eval case once (`POST
 *  /eval-cases/:id/run`). Distinct from `EvalRun` above, which is a
 *  workspace-wide BATCH result ("Run eval (N)" on the Eval Dashboard) —
 *  that one aggregates many of these into `per_trace[]`. */
export const EvalCaseRun = z.object({
  id: z.string(),
  case_id: z.string(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().min(0).max(1).nullable(),
  precision: z.number().min(0).max(1).nullable(),
  citation_accuracy: z.number().min(0).max(1).nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalCaseRun = z.infer<typeof EvalCaseRun>;

/** An eval case with its most recent run embedded — what the Evals tab's
 *  case list actually renders (pass/fail/never-run + recall%) without a
 *  second round-trip per case. */
export const EvalCaseListItem = EvalCase.extend({
  last_run: EvalCaseRun.nullable(),
});
export type EvalCaseListItem = z.infer<typeof EvalCaseListItem>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

// ---- Skill content scan (malicious-content / prompt-injection gate) ----
// Every skill body is scanned before it can be enabled and pulled into a
// reviewing agent's prompt — see server `modules/skills/prompts.ts` for the
// scanner's system prompt and `service.ts` for when scans run.
export const SkillScanStatus = z.enum(['pending', 'clean', 'flagged', 'error']);
export type SkillScanStatus = z.infer<typeof SkillScanStatus>;

export const SkillScanSeverity = z.enum(['critical', 'high', 'medium', 'low']);
export type SkillScanSeverity = z.infer<typeof SkillScanSeverity>;

export const SkillScanCategory = z.enum([
  'instruction_override',
  'exfiltration',
  'bias_injection',
  'obfuscation',
  'external_fetch',
  'delimiter_escape',
]);
export type SkillScanCategory = z.infer<typeof SkillScanCategory>;

export const SkillScanFinding = z.object({
  severity: SkillScanSeverity,
  category: SkillScanCategory,
  excerpt: z.string(),
  location: z.string(),
  explanation: z.string(),
});
export type SkillScanFinding = z.infer<typeof SkillScanFinding>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  scan_status: SkillScanStatus,
  scan_findings: z.array(SkillScanFinding).nullish(),
  scanned_at: z.string().nullish(),
  // Project scope (SPEC-07): null = global, non-null = scoped to that repo.
  // Nullish because several existing producers (manual/file create, legacy
  // fixture-sourced community rows) never fill it — see server INSIGHTS.md
  // 2026-09-15 on required-field breakage across unrelated producers.
  repo_id: z.string().nullish(),
  // Catalog tag slugs (SPEC-07); nullish for the same reason as repo_id —
  // only community imports from the live catalog populate this.
  tags: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  path: z.string(),
  folder: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  type: SkillType,
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

/** Listing-level wrapper returned by `GET /skills/community` — the entries
 *  grouped/filtered server-side plus whether the catalog was reachable at
 *  all (SPEC-07 S-AC-8, S-AC-31). `available: false` means the upstream
 *  catalog could not be retrieved; `entries` is `[]` in that case, never a
 *  fixture/placeholder fallback. */
export const CommunityCatalogListing = z.object({
  available: z.boolean(),
  message: z.string().nullish(),
  entries: z.array(CommunitySkill),
});
export type CommunityCatalogListing = z.infer<typeof CommunityCatalogListing>;

/** Outcome of the Settings catalog test action (SPEC-07 S-AC-4) — a sibling
 *  type to `ConnTestResult`, NOT a `ConnTestProvider` widening: the catalog
 *  test has no `provider` dimension, only a resolved repo + boolean outcome
 *  + human-readable message (folder/entry counts on success, failure reason
 *  on error). */
export const CatalogTestResult = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type CatalogTestResult = z.infer<typeof CatalogTestResult>;

// ---- Conventions ----
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'errors',
  'testing',
  'imports',
  'typing',
  'api',
  'general',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  rationale: z.string().nullish(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  evidence_line: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
