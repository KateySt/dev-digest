import type {
  AgentCiOverview,
  CiExport,
  CiExportInput,
  CiFile,
  CiInstallation,
  CiPreview,
  CiPreviewFile,
  CiRun,
  CiSyncResult,
  GitHubClient,
  RepoRef,
  SkillScanFinding,
  SkillScanStatus,
  WorkflowRunInfo,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, CiInstallationRow } from '../../db/rows.js';
import {
  AppError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { buildRunTrace, emptyPromptAssembly } from '../../platform/trace-builder.js';
import { isScanBlocking } from '../skills/helpers.js';
import {
  CiRepository,
  type CiRunFilters,
  type CiRunWithContext,
  type InstallationWithContext,
} from './repository.js';
import {
  ArtifactExtractError,
  buildManifestYaml,
  buildMemoryJsonl,
  buildPrBody,
  buildSkillFiles,
  buildWorkflowYaml,
  collectStrings,
  extractResultFromZip,
  lintWorkflow,
  mapModel,
  resolveAgentSlug,
  runnerMetadata,
  scanForSecrets,
  slugify,
  strToU8,
  verifyArtifact,
  zipFiles,
} from './helpers.js';
import {
  AGENT_RECENT_RUNS,
  ARTIFACT_MAX_BYTES,
  CI_BRANCH,
  CI_TARGET_TYPE,
  COMMIT_MESSAGE,
  MANIFEST_VERSION,
  MEMORY_PATH,
  PR_TITLE,
  RUNNER_PATH,
  SYNC_RUNS_PER_REPO,
  SYNC_THROTTLE_MS,
  WORKFLOW_FILE,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
  artifactName,
  jobName,
  manifestPath,
} from './constants.js';

/** Secrets whose exact values must never appear in a generated file (S-AC-7). */
const GUARDED_SECRET_KEYS = ['GITHUB_TOKEN', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

/** A generated file plus its raw bytes when it must be copied unchanged. */
interface PlannedFile {
  path: string;
  contents: string;
  editable: boolean;
  /** Runner bundle bytes (contents stay empty so the body is never serialized). */
  bytes?: Uint8Array;
  metadata?: CiPreviewFile['metadata'];
}

interface ExportPlan {
  agent: AgentRow;
  slug: string;
  repoRef: RepoRef;
  files: PlannedFile[];
  warnings: string[];
  workflowAgents: { name: string; slug: string }[];
  runnerMeta: ReturnType<typeof runnerMetadata>;
}

/**
 * ci service (Ring 1). Backs the Agent Editor's CI tab, the Export wizard and
 * the CI Runs page. Depends only on ports (`GitHubClient`, the runner bundle
 * provider), `CiRepository`, the agents repo and pure helpers — no Drizzle.
 *
 * Export = commit the file set to the shared `devdigest/ci` branch and open
 * (or reuse) one PR. Sync = pull completed workflow runs through the Settings
 * PAT and persist only artifacts that pass verification against GitHub's own
 * run metadata.
 */
export class CiService {
  private repo: CiRepository;
  private syncCache = new Map<string, { at: number; result: CiSyncResult }>();

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  // ---- preview / export / zip ------------------------------------------

  /** Generate the file set an export would commit. No GitHub or DB writes. */
  async preview(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiPreview> {
    const plan = await this.plan(workspaceId, agentId, input);
    return {
      files: plan.files.map((f) => ({
        path: f.path,
        contents: f.contents,
        editable: f.editable,
        ...(f.metadata ? { metadata: f.metadata } : {}),
      })),
      warnings: plan.warnings,
    };
  }

  /** Commit the file set to `devdigest/ci`, open or reuse the PR, record the install. */
  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    const plan = await this.plan(workspaceId, agentId, input);
    const github = await this.container.github();

    let prUrl: string;
    let repoId: number;
    // Tracks which GitHub call is in flight so a 403/404 maps to the right error.
    let step: GitHubStep = 'repo';
    try {
      const info = await github.getRepo(plan.repoRef);
      repoId = info.id;
      step = plan.files.some((f) => f.path.startsWith(WORKFLOWS_DIR)) ? 'commit_workflows' : 'commit';
      await github.commitFiles(plan.repoRef, {
        branch: CI_BRANCH,
        base: info.defaultBranch,
        message: COMMIT_MESSAGE,
        files: plan.files.map((f) => ({
          path: f.path,
          // The runner is shipped byte-for-byte (it is UTF-8 text).
          contents: f.bytes ? new TextDecoder().decode(f.bytes) : f.contents,
        })),
      });
      step = 'pr';
      const existing = await github.findOpenPr(plan.repoRef, CI_BRANCH);
      const pr =
        existing ??
        (await github.openPullRequest(plan.repoRef, {
          title: PR_TITLE,
          head: CI_BRANCH,
          base: info.defaultBranch,
          body: buildPrBody({ agents: plan.workflowAgents, runnerMeta: plan.runnerMeta }),
        }));
      prUrl = pr.url;
    } catch (err) {
      throw mapGitHubError(err, step);
    }

    const row = await this.repo.upsertInstallation({
      agentId,
      repo: input.repo,
      targetType: CI_TARGET_TYPE,
      githubRepoId: repoId,
      branch: CI_BRANCH,
      workflowPath: WORKFLOW_PATH,
      workflowVersion: WORKFLOW_VERSION,
      manifestVersion: MANIFEST_VERSION,
      exportedCiFailOn: plan.agent.ciFailOn,
      postAs: input.post_as,
      triggers: input.triggers,
      prUrl,
      agentSlug: plan.slug,
    });

    return {
      installation: toInstallationDto(row, plan.agent.ciFailOn, null, null),
      files: plan.files.map<CiFile>((f) => ({ path: f.path, contents: f.contents, editable: f.editable })),
      pr_url: prUrl,
    };
  }

  /** The same file set as a zip, runner body included. No GitHub or DB writes. */
  async zip(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<{ filename: string; data: Uint8Array }> {
    const plan = await this.plan(workspaceId, agentId, input);
    const data = zipFiles(plan.files.map((f) => ({ path: f.path, data: f.bytes ?? strToU8(f.contents) })));
    return { filename: `devdigest-ci-${plan.slug}.zip`, data };
  }

  // ---- reads ------------------------------------------------------------

  async agentOverview(workspaceId: string, agentId: string): Promise<AgentCiOverview> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [installs, runs] = await Promise.all([
      this.repo.listInstallationsForAgent(agentId),
      this.repo.recentRunsForAgent(agentId, AGENT_RECENT_RUNS),
    ]);
    return {
      installations: installs.map((i) =>
        toInstallationDto(i.installation, agent.ciFailOn, i.lastRunStatus, i.lastRunAt),
      ),
      recent_runs: runs.map(toRunDto),
    };
  }

  async listRuns(workspaceId: string, filters: CiRunFilters): Promise<CiRun[]> {
    const rows = await this.repo.listRuns(workspaceId, filters);
    return rows.map(toRunDto);
  }

  async listRepos(workspaceId: string): Promise<string[]> {
    return this.repo.listRepos(workspaceId);
  }

  // ---- sync (pull-based, verified ingest) --------------------------------

  async sync(workspaceId: string): Promise<CiSyncResult> {
    const cached = this.syncCache.get(workspaceId);
    if (cached && Date.now() - cached.at < SYNC_THROTTLE_MS) {
      return { ...cached.result, throttled: true };
    }

    const result: CiSyncResult = { ingested: 0, failed: 0, skipped: 0, throttled: false };
    const installs = await this.repo.listInstallationsForWorkspace(workspaceId);
    if (installs.length > 0) {
      const github = await this.container.github();
      const runsByRepo = new Map<string, WorkflowRunInfo[]>();
      const artifactsByRun = new Map<string, Awaited<ReturnType<GitHubClient['listRunArtifacts']>>>();
      for (const inst of installs) {
        await this.syncInstallation(workspaceId, github, inst, runsByRepo, artifactsByRun, result);
      }
      await this.repo.markSynced(
        installs.map((i) => i.installation.id),
        new Date(),
      );
    }
    this.syncCache.set(workspaceId, { at: Date.now(), result });
    return result;
  }

  private async syncInstallation(
    workspaceId: string,
    github: GitHubClient,
    inst: InstallationWithContext,
    runsByRepo: Map<string, WorkflowRunInfo[]>,
    artifactsByRun: Map<string, Awaited<ReturnType<GitHubClient['listRunArtifacts']>>>,
    result: CiSyncResult,
  ): Promise<void> {
    const installation = inst.installation;
    const repoRef = parseRepo(installation.repo);
    if (!repoRef) return;
    // Legacy rows exported before the slug was stored fall back to the name slug.
    const agentSlug = installation.agentSlug ?? slugify(inst.agentName);

    let runs = runsByRepo.get(installation.repo);
    if (!runs) {
      try {
        runs = await github.listWorkflowRuns(repoRef, WORKFLOW_FILE, {
          event: 'pull_request',
          perPage: SYNC_RUNS_PER_REPO,
        });
      } catch (err) {
        // The workflow file does not exist yet (the export PR is not merged).
        if ((err as { status?: number }).status === 404) return;
        throw mapGitHubError(err, 'sync');
      }
      runsByRepo.set(installation.repo, runs);
    }

    const stored = await this.repo.existingRunKeys(
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
      await this.ingestRun(workspaceId, github, repoRef, inst, agentSlug, run, artifactsByRun, result);
    }
  }

  private async ingestRun(
    workspaceId: string,
    github: GitHubClient,
    repoRef: RepoRef,
    inst: InstallationWithContext,
    agentSlug: string,
    run: WorkflowRunInfo,
    artifactsByRun: Map<string, Awaited<ReturnType<GitHubClient['listRunArtifacts']>>>,
    result: CiSyncResult,
  ): Promise<void> {
    const installation = inst.installation;
    const fail = async (ingestError: string): Promise<void> => {
      const inserted = await this.repo.recordFailedRun({
        ciInstallationId: installation.id,
        githubRunId: run.id,
        runAttempt: run.runAttempt,
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
      let artifacts = artifactsByRun.get(key);
      if (!artifacts) {
        artifacts = await github.listRunArtifacts(repoRef, run.id);
        artifactsByRun.set(key, artifacts);
      }
      const artifact = artifacts.find((a) => a.name === artifactName(agentSlug));
      if (!artifact) return fail('artifact_missing');
      if (artifact.expired) return fail('artifact_expired');
      if (artifact.sizeInBytes > ARTIFACT_MAX_BYTES) return fail('artifact_too_large');
      zipBytes = await github.downloadArtifact(repoRef, artifact.id, ARTIFACT_MAX_BYTES);
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
    if (strings.some((s) => scanForSecrets(s)) || (await this.containsStoredSecret(strings))) {
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
      prTitle = (await github.getPullRequest(repoRef, prNumber)).title;
    } catch {
      prTitle = null;
    }

    const findingsCount = artifact.findings_count;
    const jobConclusion = await this.agentJobConclusion(github, repoRef, run, agentSlug);
    const runFailed = jobConclusion === 'failure' && !artifact.gate_triggered;
    const trace = buildRunTrace({
      config: {
        agent: artifact.agent,
        version: String(artifact.manifest_version),
        provider: 'openrouter',
        model: artifact.model,
        pr: prNumber,
        source: 'ci',
        commit_sha: artifact.commit_sha,
        manifest_version: artifact.manifest_version,
        repo: installation.repo,
        dependencies: artifact.dependencies,
      },
      stats: {
        duration_ms: artifact.duration_ms ?? 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: artifact.cost_usd,
        findings: findingsCount,
        grounding: '',
      },
      promptAssembly: emptyPromptAssembly('', ''),
      toolCalls: [],
      rawOutput: '',
      memoryPulled: [],
      specsRead: [],
      log: [],
    });

    const inserted = await this.repo.ingestVerifiedRun({
      workspaceId,
      agentId: installation.agentId,
      installationId: installation.id,
      githubRunId: run.id,
      runAttempt: run.runAttempt,
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
      trace,
    });
    if (inserted) result.ingested++;
    else result.skipped++;
  }

  // ---- planning ----------------------------------------------------------

  /** Build the file set shared by preview, export and zip. Writes nothing. */
  private async plan(workspaceId: string, agentId: string, input: CiExportInput): Promise<ExportPlan> {
    if (input.target !== CI_TARGET_TYPE) {
      throw new ValidationError('Only the GitHub Actions target is supported');
    }
    const repoRef = parseRepo(input.repo);
    if (!repoRef) throw new ValidationError('repo must be "owner/name"');

    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const linked = await this.container.agentsRepo.linkedSkills(agentId);
    const skills = linked
      .filter(
        (l) =>
          l.skill.enabled &&
          !isScanBlocking(l.skill.scanStatus as SkillScanStatus, l.skill.scanFindings as SkillScanFinding[] | null),
      )
      .map((l) => ({ name: l.skill.name, body: l.skill.body }));
    const skillFiles = buildSkillFiles(skills);

    const warnings: string[] = [];
    const mapped = mapModel(agent.provider, agent.model);
    if (mapped.warning) warnings.push(mapped.warning);

    // One job per agent already installed on this repo, plus this one.
    const peers = await this.repo.listInstallationsForRepo(workspaceId, input.repo);
    const peerSlugs = peers.map((p) => ({
      agentId: p.installation.agentId,
      slug: p.installation.agentSlug ?? slugify(p.agentName),
    }));
    const slug = resolveAgentSlug({
      agentId,
      agentName: agent.name,
      existingSlug: peers.find((p) => p.installation.agentId === agentId)?.installation.agentSlug,
      peers: peerSlugs,
    });
    const manifestYaml = buildManifestYaml(
      agent,
      slug,
      skillFiles.map((s) => s.slug),
      { post_as: input.post_as },
    );

    const workflowAgents = new Map<string, { name: string; slug: string }>();
    peers.forEach((p, i) => {
      const peerSlug = peerSlugs[i]!.slug;
      workflowAgents.set(peerSlug, { name: p.agentName, slug: peerSlug });
    });
    workflowAgents.set(slug, { name: agent.name, slug });
    const agentList = [...workflowAgents.values()].sort((a, b) => a.slug.localeCompare(b.slug));

    const workflowYaml =
      input.workflow_yaml ?? buildWorkflowYaml({ agents: agentList, triggers: input.triggers });
    if (input.workflow_yaml) {
      const violations = lintWorkflow(input.workflow_yaml);
      if (violations.length > 0) throw new ValidationError('Workflow lint failed', { violations });
    }

    const runnerBytes = await this.container.runnerBundle.load();
    const runnerMeta = runnerMetadata(runnerBytes);

    const files: PlannedFile[] = [
      { path: manifestPath(slug), contents: manifestYaml, editable: false },
      ...skillFiles.map((s) => ({ path: s.path, contents: s.contents, editable: false })),
      { path: MEMORY_PATH, contents: buildMemoryJsonl(), editable: false },
      { path: RUNNER_PATH, contents: '', editable: false, bytes: runnerBytes, metadata: runnerMeta },
      { path: WORKFLOW_PATH, contents: workflowYaml, editable: true },
    ];

    await this.assertNoSecrets(files.filter((f) => !f.bytes));
    for (const f of files) {
      if (!f.bytes && scanForSecrets(f.contents)) {
        warnings.push(`${f.path} contains text that looks like an access token prefix. Check it before installing.`);
      }
    }

    return { agent, slug, repoRef, files, warnings, workflowAgents: agentList, runnerMeta };
  }

  /** True when any string contains one of the server's real secret values. */
  private async containsStoredSecret(strings: string[]): Promise<boolean> {
    for (const key of GUARDED_SECRET_KEYS) {
      const value = await this.container.secrets.get(key);
      if (!value || value.length < 8) continue;
      if (strings.some((s) => s.includes(value))) return true;
    }
    return false;
  }

  /**
   * Conclusion of this agent's own job (matched by the name `buildWorkflowYaml`
   * gives it). Falls back to the whole run's conclusion if the job list is
   * unavailable or has no match.
   */
  private async agentJobConclusion(
    github: GitHubClient,
    repoRef: RepoRef,
    run: WorkflowRunInfo,
    agentSlug: string,
  ): Promise<string | null> {
    try {
      const jobs = await github.listRunJobs(repoRef, run.id);
      const job = jobs.find((j) => j.name === jobName(agentSlug));
      if (job) return job.conclusion;
    } catch {
      // fall through to the run-level conclusion
    }
    return run.conclusion;
  }

  /** Refuse to emit a file that contains one of the server's real secret values (S-AC-7). */
  private async assertNoSecrets(files: PlannedFile[]): Promise<void> {
    for (const key of GUARDED_SECRET_KEYS) {
      const value = await this.container.secrets.get(key);
      if (!value || value.length < 8) continue;
      if (files.some((f) => f.contents.includes(value))) {
        throw new ValidationError('A generated file contains a stored secret value; remove it and retry.');
      }
    }
  }
}

// ---- pure mapping helpers (no I/O) -----------------------------------------

function parseRepo(repoFullName: string): RepoRef | null {
  const parts = repoFullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

type GitHubStep = 'repo' | 'commit' | 'commit_workflows' | 'pr' | 'sync';

const WORKFLOWS_DIR = '.github/workflows/';

/**
 * Maps a GitHub failure to a domain error. `pat_workflow_scope` only for a
 * 403/404 raised while committing files under `.github/workflows/` (S-AC-25);
 * any other 403/404 surfaces as a distinct not-found / forbidden error.
 */
function mapGitHubError(err: unknown, step: GitHubStep): Error {
  if (err instanceof AppError) return err;
  const status = (err as { status?: number }).status;
  if ((status === 403 || status === 404) && step === 'commit_workflows') {
    return new AppError(
      'pat_workflow_scope',
      'The GitHub token needs the "workflow" scope (classic) or Workflows: write (fine-grained) to add .github/workflows files.',
      403,
    );
  }
  if (status === 404) {
    return new AppError('github_repo_not_found', 'Repository not found or PAT has no access', 404);
  }
  if (status === 403) {
    return new AppError('github_forbidden', 'GitHub denied the request: the token lacks permission for this repository.', 403);
  }
  return new ExternalServiceError(`GitHub request failed: ${(err as Error).message ?? 'unknown error'}`);
}

function toInstallationDto(
  row: CiInstallationRow,
  agentCiFailOn: string,
  lastRunStatus: string | null,
  lastRunAt: Date | null,
): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
    github_repo_id: row.githubRepoId,
    branch: row.branch,
    workflow_path: row.workflowPath,
    workflow_version: row.workflowVersion,
    manifest_version: row.manifestVersion,
    exported_ci_fail_on: row.exportedCiFailOn,
    post_as: row.postAs,
    triggers: row.triggers,
    pr_url: row.prUrl,
    last_synced_at: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    // Only a Fail CI on change flags an installation (A6).
    out_of_date: row.exportedCiFailOn !== agentCiFailOn,
    last_run_status: lastRunStatus,
    last_run_at: lastRunAt ? lastRunAt.toISOString() : null,
  };
}

function toRunDto(r: CiRunWithContext): CiRun {
  const run = r.run;
  return {
    id: run.id,
    ci_installation_id: run.ciInstallationId,
    pr_number: run.prNumber,
    ran_at: run.ranAt ? run.ranAt.toISOString() : null,
    status: run.status,
    findings_count: run.findingsCount,
    cost_usd: run.costUsd,
    github_url: run.githubUrl,
    source: run.source,
    agent: r.agentName,
    duration_s: run.durationMs != null ? run.durationMs / 1000 : null,
    agent_id: r.agentId,
    agent_name: r.agentName,
    repo: r.repo,
    pr_title: run.prTitle,
    pr_url: r.repo && run.prNumber != null ? `https://github.com/${r.repo}/pull/${run.prNumber}` : null,
    duration_ms: run.durationMs,
    critical: run.critical,
    warning: run.warning,
    suggestion: run.suggestion,
    verdict: run.verdict,
    ingest_error: run.ingestError,
    agent_run_id: run.agentRunId,
    job_url: run.jobUrl,
    commit_sha: run.commitSha,
    workflow_version: r.workflowVersion,
  };
}
