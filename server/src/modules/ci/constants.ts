/** Constants for the ci module. */

/** Fallback base branch when the target repo isn't already tracked in this
 *  workspace's `repos` table (so its real default branch is unknown). */
export const DEFAULT_BASE_BRANCH = 'main';

export const CI_TARGET_TYPE = 'gha' as const;

export function workflowPath(agentSlug: string): string {
  return `.github/workflows/devdigest-${agentSlug}.yml`;
}

export function configPath(agentSlug: string): string {
  return `.devdigest/${agentSlug}.json`;
}

export function ciBranch(agentSlug: string): string {
  return `devdigest/ci-${agentSlug}`;
}

export const PR_TITLE = 'Add DevDigest CI review';

/** Default page size for GET /ci-runs. */
export const CI_RUNS_LIMIT = 50;
