/** Constants for the ci module. */

export const CI_TARGET_TYPE = 'gha' as const;

/** Shared branch for every agent exported to a repo (one PR per repo). */
export const CI_BRANCH = 'devdigest/ci';

export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
/** Basename GitHub's "list workflow runs" endpoint expects. */
export const WORKFLOW_FILE = 'devdigest-review.yml';
export const RUNNER_PATH = '.devdigest/runner.mjs';
export const MEMORY_PATH = '.devdigest/memory.jsonl';

export function manifestPath(agentSlug: string): string {
  return `.devdigest/agents/${agentSlug}.yaml`;
}

export function skillPath(skillSlug: string): string {
  return `.devdigest/skills/${skillSlug}.md`;
}

/** Artifact name each per-agent job uploads (unique within a workflow run). */
export function artifactName(agentSlug: string): string {
  return `devdigest-result-${agentSlug}`;
}

/** Job id + display name of one agent's job (sync matches the per-agent conclusion by `name`). */
export function jobId(agentSlug: string): string {
  return `review-${agentSlug}`;
}
export function jobName(agentSlug: string): string {
  return `DevDigest review (${agentSlug})`;
}

/** The only job-level `if:` a generated (or edited) workflow may carry: skip fork PRs. */
export const FORK_GUARD_IF = 'github.event.pull_request.head.repo.full_name == github.repository';
/** The only `ref` a checkout step may use: the trusted base commit. */
export const CHECKOUT_BASE_REF = '${{ github.event.pull_request.base.sha }}';
/** The base checkout of the export PR has no runner yet; the run step is skipped until it is merged. */
export const RUNNER_PRESENT_IF = "hashFiles('.devdigest/runner.mjs') != ''";
export const RUNNER_MISSING_IF = "hashFiles('.devdigest/runner.mjs') == ''";

export const MANIFEST_VERSION = 1;
/** Bumped whenever the generated workflow's shape changes. */
export const WORKFLOW_VERSION = 1;

export const PR_TITLE = 'Add DevDigest CI review';
export const COMMIT_MESSAGE = 'Add DevDigest CI review';

/** Every `uses:` in a generated workflow is pinned to a full commit SHA. */
export const PINNED_ACTIONS = {
  checkout: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262', // v4.4.0
  setupNode: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020', // v4.4.0
  uploadArtifact: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02', // v4.6.2
} as const;

/** Sync is throttled per workspace (S-AC-33). */
export const SYNC_THROTTLE_MS = 30_000;
/** Max downloaded artifact size, compressed and uncompressed (S-AC-39). */
export const ARTIFACT_MAX_BYTES = 10 * 1024 * 1024;
/** `GET /agents/:id/ci` returns this many recent runs (S-AC-31). */
export const AGENT_RECENT_RUNS = 10;
/** How many recent workflow runs sync lists per installation. */
export const SYNC_RUNS_PER_REPO = 30;

/** The only permissions a generated (or user-edited) workflow may grant. */
export const ALLOWED_PERMISSIONS: Readonly<Record<string, string>> = {
  contents: 'read',
  'pull-requests': 'write',
};

/** Known token prefixes (S-AC-37). Prefix-only; no entropy detection. */
export const SECRET_PATTERNS: readonly RegExp[] = [/sk-or-/, /ghp_/, /gho_/, /ghs_/, /github_pat_/];

/** Default page size for GET /ci-runs. */
export const CI_RUNS_LIMIT = 50;

/** Period filter → window in milliseconds (GET /ci-runs?period=). */
export const PERIOD_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;
