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
/**
 * The base checkout of an export PR lacks the runner (first export) or this
 * agent's manifest (an agent added to an already-installed repo); the run step
 * is skipped until the PR is merged.
 */
export function agentInstalledIf(agentSlug: string): string {
  return `hashFiles('${RUNNER_PATH}') != '' && hashFiles('${manifestPath(agentSlug)}') != ''`;
}
export function agentMissingIf(agentSlug: string): string {
  return `hashFiles('${RUNNER_PATH}') == '' || hashFiles('${manifestPath(agentSlug)}') == ''`;
}

export const MANIFEST_VERSION = 1;
/** Bumped whenever the generated workflow's shape changes. */
export const WORKFLOW_VERSION = 2;

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

// ---------------------------------------------------------------------------
// Jenkins target (S-AC-46..86)
// ---------------------------------------------------------------------------

export const JENKINSFILE_PATH = 'Jenkinsfile';
/** Bumped whenever the generated Jenkinsfile's shape changes. */
export const JENKINSFILE_VERSION = 1;

/** Triggers a Jenkins installation may select (S-AC-49). */
export const JENKINS_TRIGGERS = ['opened', 'synchronize'] as const;

/** Per-agent result file a Jenkins stage writes and archives (S-AC-58). */
export function resultFile(agentSlug: string): string {
  return `devdigest-result-${agentSlug}.json`;
}
export const RESULT_GLOB = 'devdigest-result-*.json';

/** Canonical stage name of one agent; lint finds agent stages by it. */
export function jenkinsStageName(agentSlug: string): string {
  return `devdigest: ${agentSlug}`;
}
export const JENKINS_PREPARE_STAGE = 'devdigest: prepare';

/** Skip non-change-request builds and fork PRs (S-AC-54). */
export const JENKINS_CHANGE_GUARD = 'expression { env.CHANGE_ID != null && env.CHANGE_FORK == null }';

/**
 * Trigger guard of one agent stage (S-AC-50): build 1 of a `PR-<n>` job is
 * `opened`, any later build `synchronize`. Same shape for every selection so
 * the lint can read the list back.
 */
export function jenkinsTriggerGuard(triggers: readonly string[]): string {
  const list = [...triggers].sort().map((t) => `'${t}'`).join(', ');
  return `expression { [${list}].contains(env.BUILD_NUMBER == '1' ? 'opened' : 'synchronize') }`;
}

/** The base-restore line the lint requires before the first agent stage (S-AC-55). */
export const JENKINS_RESTORE_LINE = 'git checkout "devdigest-base/$CHANGE_TARGET" -- .devdigest';

/** Env names a Jenkinsfile may never set (S-AC-60). */
export const JENKINS_DANGEROUS_ENV = ['NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'BASH_ENV', 'ENV', 'PATH'];

/** Plugins job creation needs (S-AC-69 `jenkins_plugin_missing`). */
export const JENKINS_REQUIRED_PLUGINS = [
  'workflow-multibranch',
  'github-branch-source',
  'credentials-binding',
  'pipeline-model-definition',
];

/** Multibranch project `_class` (S-AC-69 `already_exists` vs `jenkins_job_conflict`). */
export const JENKINS_MULTIBRANCH_CLASS = 'org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject';

/** How many recent builds sync lists per `PR-<n>` job. */
export const JENKINS_BUILDS_PER_JOB = 20;
/** Max `PR-<n>` jobs sync visits per installation (newest PR numbers first). */
export const JENKINS_PR_JOBS_PER_SYNC = 50;

/** SecretsProvider key of a repo's Jenkins API token (never stored in the DB). */
export function jenkinsTokenKey(workspaceId: string, repo: string): string {
  return `jenkins_api_token:${workspaceId}:${repo.toLowerCase()}`;
}

/** Human-readable text per sync error code (CiSyncResult.errors[].message). */
export const CI_SYNC_ERROR_MESSAGES = {
  jenkins_not_configured: 'This repository has no Jenkins connection.',
  jenkins_connection_mismatch:
    "The repository's Jenkins connection points to a different server than the one this agent was exported to.",
  jenkins_auth_failed: 'Jenkins rejected the saved username or API token.',
  jenkins_unreachable: 'Jenkins could not be reached.',
  jenkins_job_not_found: 'The Jenkins job for this agent was not found.',
} as const;
