import {z} from 'zod';
import {Provider} from './knowledge.js';

/**
 * Platform / scaffolding DTOs owned by F1:
 *  - settings (GET/PUT /settings, POST /settings/test-connection)
 *  - repos (POST/GET /repos, refresh, delete)
 *  - pulls (GET /repos/:id/pulls, GET /pulls/:id)
 *  - context (Project Context folder)
 */

// ---- Feature → model selection ----
/** System LLM features whose model is selectable in Settings (per-workspace). */
export const FeatureModelId = z.enum([
  'onboarding',
  'review_intent',
  'risk_brief',
  'conformance',
  'conventions',
  'skill_eval',
  'skill_scan',
]);
export type FeatureModelId = z.infer<typeof FeatureModelId>;

/** A chosen provider + model for one feature. */
export const FeatureModelChoice = z.object({
  provider: Provider,
  model: z.string().min(1),
});
export type FeatureModelChoice = z.infer<typeof FeatureModelChoice>;

/**
 * Registry of the selectable features: stable id, display label, and the
 * built-in default used when the workspace hasn't overridden the choice. The
 * defaults MIRROR each module's constants, so behaviour is unchanged until a
 * model is explicitly picked.
 */
export interface FeatureModelDef {
  id: FeatureModelId;
  label: string;
  description: string;
  defaultProvider: Provider;
  defaultModel: string;
}
export const FEATURE_MODELS: FeatureModelDef[] = [
  {
    id: 'onboarding',
    label: 'Onboarding Tour',
    description: 'Writes the per-repo onboarding tour.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'review_intent',
    label: 'PR Review · Intent',
    description: 'Derives a PR’s intent and scope before review.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'risk_brief',
    label: 'Risk Brief',
    description: 'Assesses merge risks for a pull request.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'conformance',
    label: 'Conformance',
    description: 'Checks a PR against the project spec.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'conventions',
    label: 'Conventions',
    description: 'Extracts coding conventions from the repo.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'skill_eval',
    label: 'Skill Evals',
    description: 'Runs skill-only eval cases in the Skill Editor.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
  {
    id: 'skill_scan',
    label: 'Skill Content Scan',
    description: 'Scans a skill body for prompt-injection / malicious content before it can be enabled.',
    defaultProvider: 'openrouter',
    defaultModel: 'deepseek/deepseek-v4-flash',
  },
];

// ---- Settings ----
/**
 * Non-secret prefs/config. Secrets (API keys) are NOT stored here — they go
 * through SecretsProvider (.env in MVP). Settings is a flat key/value bag,
 * surfaced as a typed object for the well-known keys.
 */
export const SettingsKnown = z.object({
  polling_interval_min: z.number().int().min(1).default(5),
  theme: z.enum(['dark', 'light']).default('dark'),
  density: z.enum(['regular', 'compact']).default('regular'),
  sync_to_folder: z.boolean().default(true),
  automatic_reviews: z.boolean().default(false),
  /** Per-feature model overrides (provider+model), keyed by FeatureModelId. */
  feature_models: z.record(FeatureModelId, FeatureModelChoice).default({}),
  /** Community skill catalog repo override (SPEC-07), `owner/name` form.
   *  Absent/empty ⇒ fall back to the COMMUNITY_CATALOG_REPO env default. Not
   *  a secret — deliberately NOT routed through SecretsProvider, must be
   *  displayable as plain text in Settings. */
  community_catalog_repo: z.string().optional(),
  /** Read-only: the server's resolved COMMUNITY_CATALOG_REPO env default
   *  (e.g. "KateySt/SKILLS"), always present regardless of whether
   *  `community_catalog_repo` has an override saved. Not a stored setting —
   *  computed by the server on every GET/PUT /settings response so the
   *  Settings UI can show the actual effective default instead of a generic
   *  "using the server's configured default" message (C-AC-31 gap-fill). */
  community_catalog_repo_default: z.string().optional(),
});
export type SettingsKnown = z.infer<typeof SettingsKnown>;

/** Full settings payload: well-known keys + arbitrary extras. */
export const Settings = SettingsKnown.passthrough();
export type Settings = z.infer<typeof Settings>;

export const SettingsUpdate = Settings.partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;

// ---- Connection test ----
export const ConnTestProvider = z.enum(['openai', 'anthropic', 'openrouter', 'github']);
export type ConnTestProvider = z.infer<typeof ConnTestProvider>;

export const ConnTestRequest = z.object({
  provider: ConnTestProvider,
  /** Optional API key/PAT to persist and then test (BYO key from the UI). */
  key: z.string().min(1).optional(),
});
export type ConnTestRequest = z.infer<typeof ConnTestRequest>;

export const ConnTestResult = z.object({
  provider: ConnTestProvider,
  ok: z.boolean(),
  message: z.string(),
  detail: z.unknown().optional(),
});
export type ConnTestResult = z.infer<typeof ConnTestResult>;

// ---- Secrets status (which provider keys are configured; never the values) ----
/** Boolean per provider: true ⇒ a key/PAT is stored. The value is never exposed. */
export const SecretsStatus = z.object({
  openai: z.boolean(),
  anthropic: z.boolean(),
  openrouter: z.boolean(),
  github: z.boolean(),
});
export type SecretsStatus = z.infer<typeof SecretsStatus>;

// ---- Repos ----
export const RepoInput = z.object({
  url: z.string().url(),
});
export type RepoInput = z.infer<typeof RepoInput>;

export const Repo = z.object({
  id: z.string(),
  workspace_id: z.string(),
  owner: z.string(),
  name: z.string(),
  full_name: z.string(),
  default_branch: z.string(),
  clone_path: z.string().nullable(),
  // Bytes-per-language for the whole repo (GitHub's /languages endpoint has
  // no per-PR breakdown); null until the first clone/refresh fetches it.
  languages: z.record(z.string(), z.number()).nullable(),
  last_polled_at: z.string().nullable(),
  created_by: z.string().nullable(),
});
export type Repo = z.infer<typeof Repo>;

// ---- Pull requests ----
export const PrStatus = z.enum(['needs_review', 'reviewed', 'stale', 'open', 'closed', 'merged']);
export type PrStatus = z.infer<typeof PrStatus>;

export const PrMeta = z.object({
  id: z.string().nullish(),
  number: z.number().int(),
  title: z.string(),
  author: z.string(),
  avatar_url: z.string().nullable(),
  branch: z.string(),
  base: z.string(),
  head_sha: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files_count: z.number().int(),
  status: PrStatus,
  opened_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  // Latest-review score (list endpoint only; null/absent until reviewed).
  score: z.number().int().nullish(),
  cost_usd: z.number().nullish(),
  findings: z
    .object({
      CRITICAL: z.number().int(),
      WARNING: z.number().int(),
      SUGGESTION: z.number().int(),
    })
    .nullish(),
  // Downstream-caller count from the PR's cached blast radius at its current
  // head sha (list endpoint only; SPEC-05 S-AC-17). Absent — not zero — when
  // no fresh cache entry exists; never computed by the list request itself.
  blast_size: z.number().int().nullish(),
});
export type PrMeta = z.infer<typeof PrMeta>;

export const PrFile = z.object({
  path: z.string(),
  additions: z.number().int(),
  deletions: z.number().int(),
  patch: z.string().nullish(),
});
export type PrFile = z.infer<typeof PrFile>;

export const PrCommit = z.object({
  sha: z.string(),
  message: z.string(),
  author: z.string(),
  committed_at: z.string().nullish(),
});
export type PrCommit = z.infer<typeof PrCommit>;

export const IssueMeta = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.string(),
});
export type IssueMeta = z.infer<typeof IssueMeta>;

export const PrDetail = PrMeta.extend({
  body: z.string().nullish(),
  files: z.array(PrFile),
  commits: z.array(PrCommit),
  linked_issue: IssueMeta.nullish(),
});
export type PrDetail = z.infer<typeof PrDetail>;

// ---- PR review (inline) comments ----
/**
 * A GitHub PR review comment anchored to a diff line. Mirrors the fields the
 * "Files changed" tab needs to render threads inline; `line` is the position in
 * the current diff (null when GitHub can no longer anchor it → `is_outdated`).
 */
export const PrReviewComment = z.object({
  id: z.number().int(),
  path: z.string(),
  line: z.number().int().nullable(),
  original_line: z.number().int().nullable(),
  side: z.enum(['LEFT', 'RIGHT']),
  body: z.string(),
  user: z.string(),
  created_at: z.string(),
  html_url: z.string(),
  in_reply_to_id: z.number().int().nullable(),
  /** GitHub couldn't anchor it to the current diff (line == null). */
  is_outdated: z.boolean(),
});
export type PrReviewComment = z.infer<typeof PrReviewComment>;

/** Body for POST /pulls/:id/comments (create one inline comment / reply). */
export const PrCommentInput = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(['LEFT', 'RIGHT']).optional(),
  body: z.string().min(1),
  /** Reply to an existing review comment thread (its comment id). */
  in_reply_to: z.number().int().optional(),
});
export type PrCommentInput = z.infer<typeof PrCommentInput>;

/** Body for PATCH /pulls/:id/comments/:commentId (edit an inline comment). */
export const PrCommentUpdateInput = z.object({
  body: z.string().min(1),
});
export type PrCommentUpdateInput = z.infer<typeof PrCommentUpdateInput>;

// ---- Project Context (SPEC-04) ----
/** Allowlisted source-folder tag a discovered document lives under. An
 *  overlapping path (e.g. `docs/specs/api.md`) still gets exactly ONE tag —
 *  the first allowlisted segment encountered walking the path from the root
 *  — never two list entries for the same file. */
export const ProjectContextSourceFolder = z.enum(['specs', 'docs', 'insights']);
export type ProjectContextSourceFolder = z.infer<typeof ProjectContextSourceFolder>;

/**
 * A discovered/attachable project-context document. DECISION: extends the
 * pre-existing `SpecFile` stub in place (every original field kept) rather
 * than superseding it with a new export — SpecFile had exactly one existing
 * consumer (`client/src/lib/hooks/core.ts`'s dormant `useContextFiles`,
 * retargeted onto this same shape by this feature), so extending avoids a
 * second, competing type for the same concept. New fields are `.nullish()`
 * except where every server response fills them.
 */
export const SpecFile = z.object({
  path: z.string(),
  content: z.string().nullish(),
  size: z.number().int().nullish(),
  updated_at: z.string().nullish(),
  /** Allowlisted source-folder tag (AC-1). */
  source_folder: ProjectContextSourceFolder.nullish(),
  /** Token count under the requesting scope's configured model (AC-5). */
  tokens: z.number().int().nullish(),
  /** True when `tokens` came from the heuristic fallback, not a real
   *  tokenizer for the configured model (AC-6). */
  tokens_estimated: z.boolean().nullish(),
  /** % of enabled agents+skills in the workspace that reach this document
   *  (AC-21); null = not applicable (zero enabled agents/skills), never 0. */
  coverage_pct: z.number().min(0).max(100).nullish(),
  /** Distinct agents reaching this document, directly or via an attached,
   *  enabled skill (AC-22). */
  used_by_agents: z.number().int().nullish(),
  /** Modified in the clone's working tree but not committed (AC-28). */
  locally_modified: z.boolean().nullish(),
});
export type SpecFile = z.infer<typeof SpecFile>;

/** GET /repos/:id/context response. */
export const ProjectContextList = z.object({
  documents: z.array(SpecFile),
  /** True when the repo has no clone on disk yet — `documents` is `[]`
   *  instead of an error (AC-2). */
  degraded: z.boolean(),
  last_refreshed_at: z.string().nullish(),
});
export type ProjectContextList = z.infer<typeof ProjectContextList>;

/** One entry of an agent's/skill's ordered attached-document set. */
export const ProjectContextAttachment = z.object({
  path: z.string(),
  order: z.number().int(),
});
export type ProjectContextAttachment = z.infer<typeof ProjectContextAttachment>;

/** Body for the whole-ordered-set-replace attach endpoints (agent + skill) —
 *  same shape as `POST /agents/:id/skills`'s `skill_ids` (skills.md,
 *  SPEC-01): the whole set, in the order it should be stored. */
export const SetProjectContextBody = z.object({
  paths: z.array(z.string()),
});
export type SetProjectContextBody = z.infer<typeof SetProjectContextBody>;

/** Body for create/save (POST/PUT of one document's content). */
export const SaveProjectContextBody = z.object({
  path: z.string(),
  content: z.string(),
});
export type SaveProjectContextBody = z.infer<typeof SaveProjectContextBody>;

/** AC-28: the clone-advance refusal. Reported as a degraded, non-throwing
 *  outcome of the existing shape (matches repo-intel's `no_clone` /
 *  `sync_failed` degraded returns) rather than a new error class. */
export const ProjectContextAdvanceRefused = z.object({
  refused: z.literal(true),
  blocking_paths: z.array(z.string()),
});
export type ProjectContextAdvanceRefused = z.infer<typeof ProjectContextAdvanceRefused>;

export const IndexStatus = z.object({
  status: z.enum(['idle', 'cloning', 'parsing', 'embedding', 'done', 'error']),
  pct: z.number().min(0).max(100),
  message: z.string().nullish(),
  chunks_indexed: z.number().int().nullish(),
});
export type IndexStatus = z.infer<typeof IndexStatus>;

// ---- Run request (review trigger; owned by A2, contract lives here) ----
export const RunRequest = z.object({
  agentId: z.string().optional(),
  all: z.boolean().optional(),
});
export type RunRequest = z.infer<typeof RunRequest>;

// ---- Structured API error envelope (returned by the API; UX taxonomy is FE) ----
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
