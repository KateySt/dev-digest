import type {
  CiSyncErrorCode,
  GitHubClient,
  JenkinsBuildInfo,
  JenkinsClient,
  JenkinsConnectionParams,
  SecretsProvider,
} from '@devdigest/shared';
import { AppError } from '../../../platform/errors.js';
import type { InstallationWithContext, JenkinsConnectionRepository } from '../repository.js';
import {
  collectStrings,
  parseRepo,
  scanForSecrets,
  slugify,
  verifyJenkinsArtifact,
} from '../helpers.js';
import {
  ARTIFACT_MAX_BYTES,
  CI_SYNC_ERROR_MESSAGES,
  JENKINS_BUILDS_PER_JOB,
  JENKINS_PR_JOBS_PER_SYNC,
  jenkinsTokenKey,
  resultFile,
} from '../constants.js';
import { triggerClass } from '../targets/jenkins.js';
import { ciRunTrace, type CiRunSource, type SyncContext } from './types.js';

/** Results that never produce an artifact worth storing (S-AC-74). */
const SKIPPED_RESULTS = new Set(['ABORTED', 'NOT_BUILT']);
const PR_JOB = /^PR-(\d+)$/;

class SyncStop extends Error {
  constructor(readonly code: CiSyncErrorCode) {
    super(code);
  }
}

function syncCode(err: unknown): CiSyncErrorCode {
  const code = err instanceof AppError ? err.code : (err as { code?: string }).code;
  if (code === 'jenkins_auth_failed' || code === 'jenkins_job_not_found') return code;
  return 'jenkins_unreachable';
}

/**
 * Jenkins: builds of each installation's `<job>/PR-<n>` branch jobs → the
 * archived `devdigest-result-<slug>.json` → verified ingest (S-AC-74..79).
 * Pull-only, through the repo's own connection. An installation that cannot be
 * synced is skipped with a per-installation error (S-AC-75); the others go on.
 */
export class JenkinsRunSource implements CiRunSource {
  /** Builds per `<repo>#<job>/PR-<n>` within this sync (peers share one job). */
  private buildsByJob = new Map<string, JenkinsBuildInfo[]>();
  private childrenByJob = new Map<string, string[]>();
  private prShas = new Map<string, string[]>();

  constructor(
    private ctx: SyncContext,
    private deps: {
      connections: JenkinsConnectionRepository;
      secrets: SecretsProvider;
      jenkins: (params: JenkinsConnectionParams) => JenkinsClient;
      github: GitHubClient;
    },
  ) {}

  async syncInstallation(inst: InstallationWithContext): Promise<void> {
    const installation = inst.installation;
    try {
      await this.syncOne(inst);
      if (installation.lastSyncError) await this.ctx.repo.setLastSyncError(installation.id, null);
    } catch (err) {
      if (!(err instanceof SyncStop)) throw err;
      await this.ctx.repo.setLastSyncError(installation.id, err.code);
      this.ctx.result.errors.push({
        installation_id: installation.id,
        repo: installation.repo,
        agent_id: installation.agentId,
        code: err.code,
        message: CI_SYNC_ERROR_MESSAGES[err.code],
      });
    }
  }

  private async client(inst: InstallationWithContext): Promise<JenkinsClient> {
    const { workspaceId } = this.ctx;
    const installation = inst.installation;
    const conn = await this.deps.connections.get(workspaceId, installation.repo);
    if (!conn) throw new SyncStop('jenkins_not_configured');
    // Q3: null = exported without a connection → no origin to compare.
    if (installation.ciServerUrl && new URL(installation.ciServerUrl).origin !== new URL(conn.url).origin) {
      throw new SyncStop('jenkins_connection_mismatch'); // no credential is sent
    }
    const token = await this.deps.secrets.get(jenkinsTokenKey(workspaceId, installation.repo));
    if (!token) throw new SyncStop('jenkins_not_configured');
    return this.deps.jenkins({ baseUrl: conn.url, username: conn.username, token });
  }

  private async syncOne(inst: InstallationWithContext): Promise<void> {
    const { result, repo } = this.ctx;
    const installation = inst.installation;
    const repoRef = parseRepo(installation.repo);
    if (!repoRef) return;
    const jobName = installation.ciJobName;
    if (!jobName) throw new SyncStop('jenkins_job_not_found');
    const agentSlug = installation.agentSlug ?? slugify(inst.agentName);
    const triggers = installation.triggers ?? [];
    const client = await this.client(inst);
    const cacheKey = (job: string) => `${installation.repo.toLowerCase()}#${job}`;

    let children = this.childrenByJob.get(cacheKey(jobName));
    if (!children) {
      try {
        children = await client.listChildJobs(jobName);
      } catch (err) {
        throw new SyncStop(syncCode(err));
      }
      this.childrenByJob.set(cacheKey(jobName), children);
    }
    const prJobs = children
      .map((name) => ({ name, n: Number(PR_JOB.exec(name)?.[1] ?? NaN) }))
      .filter((j) => Number.isInteger(j.n) && j.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, JENKINS_PR_JOBS_PER_SYNC);

    for (const prJob of prJobs) {
      const jobPath = `${jobName}/${prJob.name}`;
      let builds = this.buildsByJob.get(cacheKey(jobPath));
      if (!builds) {
        try {
          builds = await client.listBuilds(jobPath, JENKINS_BUILDS_PER_JOB);
        } catch (err) {
          const code = syncCode(err);
          // The PR job vanished between listings (PR closed) — just move on.
          if (code === 'jenkins_job_not_found') continue;
          throw new SyncStop(code);
        }
        this.buildsByJob.set(cacheKey(jobPath), builds);
      }

      const candidates = builds.filter((b) => {
        if (b.building || b.result === null) {
          result.skipped++; // reconsidered on a later sync
          return false;
        }
        if (SKIPPED_RESULTS.has(b.result)) return false;
        if (b.timestamp < installation.installedAt.getTime()) return false;
        // S-AC-51: a build this agent's stage skipped by its trigger guard.
        if (!triggers.includes(triggerClass(b.number))) return false;
        return true;
      });
      const ids = candidates.map((b) => externalBuildId(prJob.n, b));
      const stored = await repo.existingExternalBuildIds(installation.id, ids);
      for (const build of candidates) {
        if (stored.has(externalBuildId(prJob.n, build))) {
          result.skipped++;
          continue;
        }
        await this.ingestBuild(inst, client, { jobName, jobPath, prNumber: prJob.n, agentSlug, build });
      }
    }
  }

  private async ingestBuild(
    inst: InstallationWithContext,
    client: JenkinsClient,
    b: { jobName: string; jobPath: string; prNumber: number; agentSlug: string; build: JenkinsBuildInfo },
  ): Promise<void> {
    const { result, repo } = this.ctx;
    const installation = inst.installation;
    const identity = { source: 'jenkins' as const, externalBuildId: externalBuildId(b.prNumber, b.build) };
    const jobUrl = client.jobUrl(b.jobPath, b.build.number); // built from the saved base URL (S-AC-78)
    const ranAt = new Date(b.build.timestamp);
    const fail = async (ingestError: string): Promise<void> => {
      const inserted = await repo.recordFailedRun({
        ciInstallationId: installation.id,
        identity,
        ranAt,
        prNumber: b.prNumber,
        commitSha: null,
        jobUrl,
        ingestError,
        agentSlug: b.agentSlug,
      });
      if (inserted) result.failed++;
      else result.skipped++;
    };

    let bytes: Uint8Array | null;
    try {
      bytes = await client.getArtifact(b.jobPath, b.build.number, resultFile(b.agentSlug), ARTIFACT_MAX_BYTES);
    } catch (err) {
      if (err instanceof AppError && err.code === 'artifact_too_large') return fail('artifact_too_large');
      const code = syncCode(err);
      if (code === 'jenkins_auth_failed') throw new SyncStop(code);
      result.skipped++; // transient: retried on a later sync
      return;
    }
    // Missing and discarded (build discarder) look the same (S-AC-76).
    if (bytes === null) return fail('artifact_missing');

    const text = new TextDecoder().decode(bytes);
    if (scanForSecrets(text)) return fail('secret_detected');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail('verification_failed:schema');
    }
    const strings = collectStrings(raw);
    if (strings.some((s) => scanForSecrets(s)) || (await this.ctx.containsStoredSecret(strings))) {
      return fail('secret_detected');
    }

    const repoRef = parseRepo(installation.repo)!;
    const shaKey = `${installation.repo.toLowerCase()}#${b.prNumber}`;
    let prCommitShas = this.prShas.get(shaKey);
    if (!prCommitShas) {
      try {
        prCommitShas = await this.deps.github.listPullRequestCommitShas(repoRef, b.prNumber);
      } catch {
        result.skipped++; // GitHub hiccup: retry the build on a later sync
        return;
      }
      this.prShas.set(shaKey, prCommitShas);
    }

    const verified = verifyJenkinsArtifact(
      raw,
      {
        prNumber: b.prNumber,
        buildNumber: b.build.number,
        ciJob: `${b.jobName}/PR-${b.prNumber}`,
        prCommitShas,
      },
      { githubRepoId: installation.githubRepoId, agentSlug: b.agentSlug, repo: installation.repo },
    );
    if (!verified.ok) return fail(`verification_failed:${verified.check}`);
    const artifact = verified.artifact;

    let prTitle: string | null = null;
    try {
      prTitle = (await this.deps.github.getPullRequest(repoRef, b.prNumber)).title;
    } catch {
      prTitle = null;
    }

    // S-AC-79: status comes from the artifact; a triggered gate is not a failure.
    const findingsCount = artifact.findings_count;
    const inserted = await repo.ingestVerifiedRun({
      workspaceId: this.ctx.workspaceId,
      agentId: installation.agentId,
      installationId: installation.id,
      identity,
      ranAt,
      jobUrl,
      prNumber: b.prNumber,
      prTitle,
      commitSha: artifact.commit_sha,
      agentSlug: b.agentSlug,
      verdict: artifact.verdict,
      model: artifact.model,
      manifestVersion: artifact.manifest_version,
      critical: artifact.critical ?? 0,
      warning: artifact.warning ?? 0,
      suggestion: artifact.suggestion ?? 0,
      blockers: artifact.blockers,
      findingsCount,
      durationMs: artifact.duration_ms ?? null,
      costUsd: artifact.cost_usd,
      agentRunStatus: 'done',
      ciStatus: findingsCount > 0 ? 'succeeded' : 'no_findings',
      trace: ciRunTrace(artifact, b.prNumber, installation.repo),
    });
    if (inserted) result.ingested++;
    else result.skipped++;
  }
}

/** S-AC-78: stable across job re-creation (build numbers restart, start times don't). */
function externalBuildId(prNumber: number, build: JenkinsBuildInfo): string {
  return `PR-${prNumber}#${build.number}@${build.timestamp}`;
}
