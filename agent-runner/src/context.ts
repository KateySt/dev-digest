import { readFileSync } from 'node:fs';
import { RunnerError } from './errors.js';

/**
 * Resolves the PR context (owner/repo/number/title/body/fork) from the
 * GitHub-Actions-injected env vars + the standard `pull_request` event
 * payload — "the CI context" the runner assembles the diff + PR body/title
 * from (T8 action). `GITHUB_REPOSITORY` and `PR_NUMBER` are explicit env vars
 * the generated workflow sets (`buildWorkflowYaml` in `server/src/modules/ci/helpers.ts`);
 * `GITHUB_EVENT_PATH` is a default GitHub Actions runtime var (always present)
 * pointing at the JSON payload for the triggering event, which carries the
 * (untrusted, author-controlled) PR title/body and the fork flag.
 */

export interface CiEnv {
  GITHUB_REPOSITORY?: string;
  PR_NUMBER?: string;
  GITHUB_EVENT_PATH?: string;
  GITHUB_RUN_ID?: string;
  GITHUB_RUN_ATTEMPT?: string;
  [key: string]: string | undefined;
}

export interface PrContext {
  owner: string;
  repo: string;
  prNumber: number;
  /** PR title (untrusted, author-controlled). */
  title: string;
  /** PR body/description (untrusted, author-controlled). */
  body: string;
  /** True when the PR head is a fork — informational only; the workflow
   *  itself is responsible for never scheduling this job for fork PRs. */
  isFork: boolean;
  /** PR head commit SHA (from the event payload). */
  headSha: string;
  /** GitHub numeric repository id (from the event payload). */
  repositoryId: number;
  /** GitHub Actions run id / attempt (from the runner env). */
  runId: number;
  runAttempt: number;
}

interface PullRequestEventPayload {
  pull_request?: {
    number?: number;
    title?: string;
    body?: string | null;
    head?: { sha?: string; repo?: { fork?: boolean } | null };
    base?: { repo?: { id?: number } | null };
  };
  repository?: { id?: number };
}

function readEventPayload(
  eventPath: string | undefined,
  readFile: typeof readFileSync,
): PullRequestEventPayload | null {
  if (!eventPath) return null;
  let raw: string;
  try {
    raw = readFile(eventPath, 'utf8') as unknown as string;
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as PullRequestEventPayload;
  } catch {
    return null;
  }
}

/** Resolve the PR context from env + (best-effort) event payload. */
export function resolvePrContext(
  env: CiEnv,
  readFile: typeof readFileSync = readFileSync,
): PrContext {
  const repository = env.GITHUB_REPOSITORY;
  if (!repository || !repository.includes('/')) {
    throw new RunnerError(
      `GITHUB_REPOSITORY must be set to "owner/name" (got: ${JSON.stringify(repository)})`,
    );
  }
  const [owner, repo] = repository.split('/', 2) as [string, string];

  const event = readEventPayload(env.GITHUB_EVENT_PATH, readFile);
  const pr = event?.pull_request;

  const prNumberRaw = env.PR_NUMBER ?? (pr?.number != null ? String(pr.number) : undefined);
  const prNumber = prNumberRaw ? Number(prNumberRaw) : NaN;
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new RunnerError(
      `PR_NUMBER must resolve to a positive integer (env PR_NUMBER=${JSON.stringify(env.PR_NUMBER)}, event pull_request.number=${JSON.stringify(pr?.number)})`,
    );
  }

  const headSha = pr?.head?.sha;
  if (!headSha || !/^[0-9a-f]{40}$/.test(headSha)) {
    throw new RunnerError('Event payload is missing a valid pull_request.head.sha');
  }
  const repositoryId = pr?.base?.repo?.id ?? event?.repository?.id;
  if (!Number.isInteger(repositoryId)) {
    throw new RunnerError('Event payload is missing the numeric repository id');
  }
  const runId = Number(env.GITHUB_RUN_ID);
  const runAttempt = Number(env.GITHUB_RUN_ATTEMPT ?? '1');
  if (!Number.isInteger(runId) || runId <= 0 || !Number.isInteger(runAttempt) || runAttempt <= 0) {
    throw new RunnerError('GITHUB_RUN_ID / GITHUB_RUN_ATTEMPT must be positive integers');
  }

  return {
    owner,
    repo,
    prNumber,
    title: pr?.title ?? '',
    body: pr?.body ?? '',
    isFork: pr?.head?.repo?.fork ?? false,
    headSha,
    repositoryId: repositoryId as number,
    runId,
    runAttempt,
  };
}
