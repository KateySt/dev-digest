import { z } from 'zod';
import { patchOf } from './patch.js';

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

/** What an eval case asserts: `must_find` expects findings, `must_not_flag`
 *  forbids them (at listed locations, or anywhere when the list is empty). */
export const EvalCaseKind = z.enum(['must_find', 'must_not_flag']);
export type EvalCaseKind = z.infer<typeof EvalCaseKind>;

/** Where a case came from: hand-written, or seeded from a decided finding. */
export const EvalCaseSource = z.enum(['manual', 'finding_accepted', 'finding_dismissed']);
export type EvalCaseSource = z.infer<typeof EvalCaseSource>;

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
  kind: EvalCaseKind.default('must_find'),
  source: EvalCaseSource.default('manual'),
  /** Finding this case was seeded from; null once that finding is deleted. */
  source_finding_id: z.string().nullish(),
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
  /** Suite run this result belongs to; null for single-case runs. */
  suite_run_id: z.string().nullish(),
  /** `errored` = the case failed to execute (excluded from metrics). */
  status: z.enum(['ok', 'errored']).default('ok'),
  error: z.string().nullish(),
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

/** Provenance of a memory (SPEC-2026-10-12-memory). Everything but `context`
 *  is `.nullish()` — older/fixture payloads carry only `{ pr, context }`. */
export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
  finding_id: z.string().nullish(),
  review_id: z.string().nullish(),
  agent_id: z.string().nullish(),
  created_by: z.string().nullish(),
  created_at: z.string().nullish(),
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

/** Scopes a user can pick. `team` stays in the DB enum but is never accepted. */
export const MemoryInputScope = z.enum(['repo', 'global']);
export type MemoryInputScope = z.infer<typeof MemoryInputScope>;

export const MEMORY_CONTENT_MAX = 600;
export const MEMORY_MAX_GLOBS = 10;

export const MemoryLink = z.object({
  target_kind: z.enum(['agent', 'skill']),
  target_id: z.string().uuid(),
});
export type MemoryLink = z.infer<typeof MemoryLink>;

/** Create/edit payload. Cross-field rules (repo ⇔ repo_id, at least one link
 *  or all-agents, skill repo match) are enforced server-side, not here. */
export const MemoryInput = z.object({
  content: z.string().trim().min(1).max(MEMORY_CONTENT_MAX),
  kind: MemoryKind,
  scope: MemoryInputScope,
  repo_id: z.string().uuid().nullable(),
  path_globs: z.array(z.string().min(1)).max(MEMORY_MAX_GLOBS).default([]),
  links: z.array(MemoryLink).default([]),
  applies_to_all_agents: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.8),
});
export type MemoryInput = z.infer<typeof MemoryInput>;

export const Memory = MemoryItem.extend({
  id: z.string(),
  repo_id: z.string().nullable(),
  path_globs: z.array(z.string()),
  links: z.array(MemoryLink.extend({ name: z.string() })),
  applies_to_all_agents: z.boolean(),
  /** No links and not all-agents (its agent/skill was deleted) — never injected. */
  unlinked: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  last_used_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  stale: z.boolean(),
  /** Set on a memory archived by a curation merge: the memory it was merged into. */
  merged_into: z.string().nullable(),
  /** Last "Keep" on a stale curation candidate; resets the stale clock. */
  kept_at: z.string().nullable(),
});
export type Memory = z.infer<typeof Memory>;

export const MemorySummary = z.object({
  id: z.string(),
  content: z.string(),
  kind: MemoryKind,
  scope: MemoryScope,
  similarity: z.number(),
});
export type MemorySummary = z.infer<typeof MemorySummary>;

export const MemoryDraft = MemoryInput.extend({
  /** True when the LLM draft failed and a deterministic fallback was used. */
  fallback: z.boolean(),
});
export type MemoryDraft = z.infer<typeof MemoryDraft>;

export const LearnDraftResponse = z.object({
  draft: MemoryDraft,
  source: MemorySource,
  similar: z.array(MemorySummary),
  /** Set when the finding was already learned — the client edits that memory. */
  existing_memory_id: z.string().nullable(),
});
export type LearnDraftResponse = z.infer<typeof LearnDraftResponse>;

export const CreateMemoryBody = MemoryInput.extend({
  finding_id: z.string().uuid().optional(),
});
export type CreateMemoryBody = z.infer<typeof CreateMemoryBody>;

export const UpdateMemoryBody = patchOf(MemoryInput).extend({
  archived: z.boolean().optional(),
  /** Curation "Keep": sets `kept_at = now`, changes nothing else. */
  kept: z.literal(true).optional(),
});
export type UpdateMemoryBody = z.infer<typeof UpdateMemoryBody>;

export const MergeMemoryBody = z.object({
  content: MemoryInput.shape.content,
  confidence: z.number().min(0).max(1),
  finding_id: z.string().uuid().optional(),
});
export type MergeMemoryBody = z.infer<typeof MergeMemoryBody>;

const QueryBool = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const MemoryListQuery = z.object({
  repo_id: z.string().uuid().optional(),
  scope: MemoryInputScope.optional(),
  kind: MemoryKind.optional(),
  stale: QueryBool.default(false),
  archived: QueryBool.default(false),
  q: z.string().max(200).optional(),
});
export type MemoryListQuery = z.input<typeof MemoryListQuery>;

export const MemorySearchMode = z.enum(['semantic', 'text']);
export type MemorySearchMode = z.infer<typeof MemorySearchMode>;

export const MemoryListResponse = z.object({
  items: z.array(Memory),
  counts: z.object({
    scope: z.record(z.string(), z.number()),
    kind: z.record(z.string(), z.number()),
  }),
  search_mode: MemorySearchMode,
});
export type MemoryListResponse = z.infer<typeof MemoryListResponse>;

// ---- Memory curation (SPEC-2026-10-12-memory-curation) ----
/** Max memories in one duplicate group (scan output and merge input). */
export const CURATE_MAX_GROUP_SIZE = 10;

export const StaleReason = z.enum(['unused', 'unlinked']);
export type StaleReason = z.infer<typeof StaleReason>;

export const CurateScanBody = z.object({
  repo_id: z.string().uuid().optional(),
});
export type CurateScanBody = z.infer<typeof CurateScanBody>;

export const CurateGroup = z.object({
  members: z.array(Memory).min(2).max(CURATE_MAX_GROUP_SIZE),
  primary_id: z.string(),
  /** Highest pairwise similarity inside the group. */
  similarity: z.number(),
});
export type CurateGroup = z.infer<typeof CurateGroup>;

export const StaleCandidate = z.object({
  memory: Memory,
  reasons: z.array(StaleReason).min(1),
});
export type StaleCandidate = z.infer<typeof StaleCandidate>;

export const CurateScanResponse = z.object({
  groups: z.array(CurateGroup),
  stale: z.array(StaleCandidate),
  /** Totals before the caps, so the UI can say "showing N of M". */
  totals: z.object({ groups: z.number().int(), stale: z.number().int() }),
  mode: MemorySearchMode,
});
export type CurateScanResponse = z.infer<typeof CurateScanResponse>;

const CurateMemberIds = z.array(z.string().uuid()).min(2).max(CURATE_MAX_GROUP_SIZE);

export const CurateMergeDraftBody = z.object({ member_ids: CurateMemberIds });
export type CurateMergeDraftBody = z.infer<typeof CurateMergeDraftBody>;

export const CurateMergeDraftResponse = z.object({
  content: z.string(),
  /** True when the LLM failed and the primary's content was used. */
  fallback: z.boolean(),
});
export type CurateMergeDraftResponse = z.infer<typeof CurateMergeDraftResponse>;

export const CurateMergeBody = z.object({
  /** The repo the scan ran for (absent = global only). */
  repo_id: z.string().uuid().optional(),
  primary_id: z.string().uuid(),
  member_ids: CurateMemberIds,
  /** member id → its `updated_at` as seen by the scan (optimistic concurrency). */
  expected: z.record(z.string(), z.string()),
  result: MemoryInput,
});
export type CurateMergeBody = z.infer<typeof CurateMergeBody>;

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
  /** The skill this convention was merged into (SPEC-2026-10-16-convention-skills),
   *  or null while it is still unused. `repo_id` is the skill's current scope. */
  skill: z
    .object({ id: z.string(), name: z.string(), repo_id: z.string().nullable() })
    .nullable(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** Body of `POST /repos/:id/conventions/skill` — one skill from a selection of
 *  accepted, unused conventions. `scope: 'repo'` binds the skill to the route's
 *  repo; `'global'` leaves `repo_id` null. */
export const CreateSkillFromConventionsInput = z.object({
  convention_ids: z
    .array(z.string().uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'convention_ids must be unique'),
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  scope: z.enum(['repo', 'global']),
});
export type CreateSkillFromConventionsInput = z.infer<typeof CreateSkillFromConventionsInput>;

export const CreateSkillFromConventionsResult = z.object({
  skill: Skill,
  conventions: z.array(ConventionCandidate),
});
export type CreateSkillFromConventionsResult = z.infer<typeof CreateSkillFromConventionsResult>;

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
  // Mirrors the `agents.attached_doc_paths` column (ordered repo-relative paths).
  attached_doc_paths: z.array(z.string()).default([]),
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
  // New snapshots store `{id, version}` (the skill's own version at snapshot
  // time); snapshots written before that hold plain ids — accept both.
  skills: z.array(
    z.union([
      z.string(),
      // `name` lets Promote name a skill that was deleted since the snapshot.
      z.object({ id: z.string(), version: z.number().int(), name: z.string().optional() }),
    ]),
  ),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
