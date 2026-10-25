import type { CiEnv, PrContext } from './context.js';
import { fetchPullRequest, type FetchLike } from './github.js';
import { RunnerError } from './errors.js';

/**
 * Resolves the PR context under Jenkins (Multibranch Pipeline + GitHub Branch
 * Source), used when `JENKINS_URL` is set (S-AC-80/81). Jenkins has no event
 * payload, so the PR's title/body/head SHA/repository come from the GitHub
 * API with `GITHUB_TOKEN` — never from Jenkins or the workspace.
 *
 * - `CHANGE_ID` → PR number; `BUILD_NUMBER` → run id (attempt is always 1);
 *   `JOB_NAME` (`<job>/PR-<n>`) → `ciJob`.
 * - Repo from `DEVDIGEST_REPOSITORY` (set by the generated Jenkinsfile),
 *   falling back to a parsed `GIT_URL`.
 * - Fork PRs hard-fail: `CHANGE_FORK` set, or a head repo that is not the base.
 */

const REPO = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;

/** `https://github.com/o/r(.git)` or `git@github.com:o/r.git` → `o/r`. */
export function repoFromGitUrl(gitUrl: string | undefined): string | null {
  if (!gitUrl) return null;
  const m = /github\.com[/:]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(gitUrl.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

function positiveInt(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function resolveJenkinsPrContext(env: CiEnv, fetchImpl: FetchLike = fetch): Promise<PrContext> {
  const repository = env.DEVDIGEST_REPOSITORY || repoFromGitUrl(env.GIT_URL);
  const match = repository ? REPO.exec(repository) : null;
  if (!match) {
    throw new RunnerError(
      `DEVDIGEST_REPOSITORY (or GIT_URL) must name a GitHub repository "owner/name" (got: ${JSON.stringify(repository)})`,
    );
  }
  const [, owner, repo] = match as unknown as [string, string, string];

  const prNumber = positiveInt(env.CHANGE_ID);
  if (prNumber === null) {
    throw new RunnerError(`CHANGE_ID must be a positive integer (got: ${JSON.stringify(env.CHANGE_ID)})`);
  }
  const buildNumber = positiveInt(env.BUILD_NUMBER);
  if (buildNumber === null) {
    throw new RunnerError(`BUILD_NUMBER must be a positive integer (got: ${JSON.stringify(env.BUILD_NUMBER)})`);
  }
  const ciJob = env.JOB_NAME;
  if (!ciJob || ciJob.length > 200) {
    throw new RunnerError('JOB_NAME must be set (at most 200 characters)');
  }
  if (env.CHANGE_FORK) {
    throw new RunnerError('Refusing to review a fork pull request (CHANGE_FORK is set)');
  }

  const token = env.GITHUB_TOKEN;
  if (!token) throw new RunnerError('GITHUB_TOKEN is required under Jenkins to read the pull request');
  const pr = await fetchPullRequest({ owner, repo, prNumber }, token, fetchImpl);
  if (
    pr.headRepoFullName === null ||
    pr.headRepoFullName.toLowerCase() !== pr.baseRepoFullName.toLowerCase()
  ) {
    throw new RunnerError('Refusing to review a fork pull request (head repository differs from base)');
  }

  return {
    owner,
    repo,
    prNumber,
    title: pr.title,
    body: pr.body,
    isFork: false,
    headSha: pr.headSha,
    repositoryId: pr.baseRepoId,
    runId: buildNumber,
    runAttempt: 1,
    ciTarget: 'jenkins',
    ciJob,
  };
}
