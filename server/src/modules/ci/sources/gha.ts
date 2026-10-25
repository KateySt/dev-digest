import type { GitHubClient, RepoRef, WorkflowRunInfo } from '@devdigest/shared';
import { AppError } from '../../../platform/errors.js';
import type { InstallationWithContext } from '../repository.js';
import {
  ArtifactExtractError,
  collectStrings,
  extractResultFromZip,
  mapGitHubError,
  parseRepo,
  scanForSecrets,
  slugify,
  verifyArtifact,
} from '../helpers.js';
import { ARTIFACT_MAX_BYTES, SYNC_RUNS_PER_REPO, WORKFLOW_FILE, artifactName, jobName } from '../constants.js';
import { ciRunTrace, type CiRunSource, type SyncContext } from './types.js';

type Artifacts = Awaited<ReturnType<GitHubClient['listRunArtifacts']>>;

/** GitHub Actions: completed workflow runs → verified artifacts (S-AC-32..42). */
export class GhaRunSource implements CiRunSource {
  private runsByRepo = new Map<string, WorkflowRunInfo[]>();
  private artifactsByRun = new Map<string, Artifacts>();

  constructor(
    private ctx: SyncContext,
    private github: GitHubClient,
  ) {}

  async syncInstallation(inst: InstallationWithContext): Promise<void> {
    const { result } = this.ctx;
    const installation = inst.installation;
    const repoRef = parseRepo(installation.repo);
    if (!repoRef) return;
    // Legacy rows exported before the slug was stored fall back to the name slug.
    const agentSlug = installation.agentSlug ?? slugify(inst.agentName);

    let runs = this.runsByRepo.get(installation.repo);
    if (!runs) {
      try {
        runs = await this.github.listWorkflowRuns(repoRef, WORKFLOW_FILE, {
          event: 'pull_request',
          perPage: SYNC_RUNS_PER_REPO,
        });
      } catch (err) {
        // The workflow file does not exist yet (the export PR is not merged).
        if ((err as { status?: number }).status === 404) return;
        throw mapGitHubError(err, 'sync');
      }
      this.runsByRepo.set(installation.repo, runs);
    }

    const stored = await this.ctx.repo.existingRunKeys(
      installation.id,
      runs.map((r) => r.id),
    );

    for (const run of runs) {
      if (run.status !== 'completed') {
        result.skipped++; // considered again on a later sync (S-AC-34)
        continue;
      }
      // Fork PRs and superseded runs produce no artifact by design (S-AC-13).
      if (run.conclusion === 'skipped' || run.conclusion === 'cancelled') {
        result.skipped++;
        continue;
      }
      // Runs from before this agent was exported cannot carry its artifact.
      if (new Date(run.createdAt) < installation.installedAt) {
        result.skipped++;
        continue;
      }
      if (stored.has(`${run.id}:${run.runAttempt}`)) {
        result.skipped++; // S-AC-42
        continue;
      }
      await this.ingestRun(repoRef, inst, agentSlug, run);
    }
  }

  private async ingestRun(
    repoRef: RepoRef,
    inst: InstallationWithContext,
    agentSlug: string,
    run: WorkflowRunInfo,
  ): Promise<void> {
    const { result, repo } = this.ctx;
    const installation = inst.installation;
    const identity = { source: 'gha' as const, githubRunId: run.id, runAttempt: run.runAttempt };
    const fail = async (ingestError: string): Promise<void> => {
      const inserted = await repo.recordFailedRun({
        ciInstallationId: installation.id,
        identity,
        ranAt: new Date(run.createdAt),
        prNumber: run.pullRequests[0]?.number ?? null,
        commitSha: run.headSha,
        jobUrl: run.htmlUrl,
        ingestError,
        agentSlug,
      });
      if (inserted) result.failed++;
      else result.skipped++;
    };

    // Network errors are transient: leave the run unstored so a later sync retries it.
    let zipBytes: Uint8Array;
    try {
      const key = `${repoRef.owner}/${repoRef.name}#${run.id}`;
      let artifacts = this.artifactsByRun.get(key);
      if (!artifacts) {
        artifacts = await this.github.listRunArtifacts(repoRef, run.id);
        this.artifactsByRun.set(key, artifacts);
      }
      const artifact = artifacts.find((a) => a.name === artifactName(agentSlug));
      if (!artifact) return fail('artifact_missing');
      if (artifact.expired) return fail('artifact_expired');
      if (artifact.sizeInBytes > ARTIFACT_MAX_BYTES) return fail('artifact_too_large');
      zipBytes = await this.github.downloadArtifact(repoRef, artifact.id, ARTIFACT_MAX_BYTES);
    } catch (err) {
      if (err instanceof AppError && err.code === 'artifact_too_large') return fail('artifact_too_large');
      result.skipped++;
      return;
    }

    let text: string;
    try {
      text = extractResultFromZip(zipBytes);
    } catch (err) {
      return fail(err instanceof ArtifactExtractError ? err.code : 'artifact_invalid');
    }

    // Scan the raw text BEFORE parsing; nothing from the artifact is stored on a hit (S-AC-37).
    if (scanForSecrets(text)) return fail('secret_detected');

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail('verification_failed:schema');
    }
    // JSON escapes (e.g. "ghp_") hide prefixes from the raw scan; re-scan decoded
    // strings, and refuse any stored secret value like assertNoSecrets does.
    const strings = collectStrings(raw);
    if (strings.some((s) => scanForSecrets(s)) || (await this.ctx.containsStoredSecret(strings))) {
      return fail('secret_detected');
    }
    const verified = verifyArtifact(raw, run, {
      githubRepoId: installation.githubRepoId,
      agentSlug,
      repo: installation.repo,
    });
    if (!verified.ok) return fail(`verification_failed:${verified.check}`);
    const artifact = verified.artifact;
    const prNumber = artifact.pr_number as number; // non-null: checked against run.pullRequests

    let prTitle: string | null = null;
    try {
      prTitle = (await this.github.getPullRequest(repoRef, prNumber)).title;
    } catch {
      prTitle = null;
    }

    const findingsCount = artifact.findings_count;
    const jobConclusion = await this.agentJobConclusion(repoRef, run, agentSlug);
    const runFailed = jobConclusion === 'failure' && !artifact.gate_triggered;

    const inserted = await repo.ingestVerifiedRun({
      workspaceId: this.ctx.workspaceId,
      agentId: installation.agentId,
      installationId: installation.id,
      identity,
      ranAt: new Date(run.createdAt),
      jobUrl: run.htmlUrl, // from the API, never from the artifact
      prNumber,
      prTitle,
      commitSha: artifact.commit_sha,
      agentSlug,
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
      agentRunStatus: runFailed ? 'failed' : 'done',
      ciStatus: runFailed ? 'failed' : findingsCount > 0 ? 'succeeded' : 'no_findings',
      trace: ciRunTrace(artifact, prNumber, installation.repo),
    });
    if (inserted) result.ingested++;
    else result.skipped++;
  }

  /**
   * Conclusion of this agent's own job (matched by the name `buildWorkflowYaml`
   * gives it). Falls back to the whole run's conclusion if the job list is
   * unavailable or has no match.
   */
  private async agentJobConclusion(
    repoRef: RepoRef,
    run: WorkflowRunInfo,
    agentSlug: string,
  ): Promise<string | null> {
    try {
      const jobs = await this.github.listRunJobs(repoRef, run.id);
      const job = jobs.find((j) => j.name === jobName(agentSlug));
      if (job) return job.conclusion;
    } catch {
      // fall through to the run-level conclusion
    }
    return run.conclusion;
  }
}
