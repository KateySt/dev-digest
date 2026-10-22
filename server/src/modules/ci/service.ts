import type {
  AgentCiOverview,
  CiExport,
  CiExportInput,
  CiFile,
  CiInstallation,
  CiJenkinsInput,
  CiLintViolation,
  CiPreview,
  CiPreviewFile,
  CiRun,
  CiSyncResult,
  JenkinsClient,
  JenkinsConnection,
  JenkinsConnectionInput,
  JenkinsConnectionTestInput,
  JenkinsConnectionTestResult,
  RepoRef,
  SkillScanFinding,
  SkillScanStatus,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, CiInstallationRow, CiJenkinsConnectionRow } from '../../db/rows.js';
import {
  AppError,
  ConfigError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { isScanBlocking } from '../skills/helpers.js';
import { RepoRepository } from '../repos/repository.js';
import { MemoryRetriever } from '../memory/retrieval.js';
import {
  CiRepository,
  JenkinsConnectionRepository,
  type CiRunFilters,
  type CiRunWithContext,
  type InstallationWithContext,
} from './repository.js';
import {
  WORKFLOWS_DIR,
  buildManifestYaml,
  buildMemoryJsonl,
  buildPrBody,
  buildSkillFiles,
  buildWorkflowYaml,
  lintWorkflow,
  mapGitHubError,
  mapModel,
  normalizeJenkinsUrl,
  parseRepo,
  resolveAgentSlug,
  runnerMetadata,
  scanForSecrets,
  slugify,
  splitJobPath,
  strToU8,
  zipFiles,
  type GitHubStep,
} from './helpers.js';
import {
  AGENT_RECENT_RUNS,
  CI_BRANCH,
  COMMIT_MESSAGE,
  JENKINSFILE_PATH,
  JENKINSFILE_VERSION,
  JENKINS_MULTIBRANCH_CLASS,
  JENKINS_REQUIRED_PLUGINS,
  JENKINS_TRIGGERS,
  MANIFEST_VERSION,
  MEMORY_PATH,
  PR_TITLE,
  RUNNER_PATH,
  SYNC_THROTTLE_MS,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
  jenkinsTokenKey,
  manifestPath,
} from './constants.js';
import {
  buildJenkinsJobConfigXml,
  buildJenkinsPrBody,
  buildJenkinsfile,
  lintJenkinsfile,
  type JenkinsStageAgent,
} from './targets/jenkins.js';
import { GhaRunSource } from './sources/gha.js';
import { JenkinsRunSource } from './sources/jenkins.js';
import type { CiRunSource, SyncContext } from './sources/types.js';

/** Secrets whose exact values must never appear in a generated file (S-AC-7). */
const GUARDED_SECRET_KEYS = ['GITHUB_TOKEN', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];

type ExportTarget = 'gha' | 'jenkins';

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
  target: ExportTarget;
  agent: AgentRow;
  slug: string;
  repoRef: RepoRef;
  files: PlannedFile[];
  warnings: string[];
  workflowAgents: { name: string; slug: string }[];
  runnerMeta: ReturnType<typeof runnerMetadata>;
  /** Jenkins only: the repo-wide settings and the connection seen at plan time. */
  jenkins: CiJenkinsInput | null;
  connection: CiJenkinsConnectionRow | null;
}

/**
 * ci service (Ring 1). Backs the Agent Editor's CI tab, the Export wizard and
 * the CI Runs page. Depends only on ports (`GitHubClient`, `JenkinsClient`,
 * the runner bundle provider, `SecretsProvider`), the ci repositories, the
 * agents repo and pure helpers — no Drizzle, no fetch.
 *
 * Export = commit the file set to the shared `devdigest/ci` branch and open
 * (or reuse) one PR; for Jenkins optionally create the multibranch job. Sync =
 * pull completed runs (GitHub Actions workflow runs, Jenkins `PR-<n>` builds)
 * and persist only artifacts that pass verification.
 */
export class CiService {
  private repo: CiRepository;
  private connections: JenkinsConnectionRepository;
  private syncCache = new Map<string, { at: number; result: CiSyncResult }>();

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
    this.connections = new JenkinsConnectionRepository(container.db);
  }

  // ---- preview / export / zip ------------------------------------------

  /** Generate the file set an export would commit. No GitHub, Jenkins or DB writes. */
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

    // S-AC-68: job creation preconditions are checked before any GitHub write.
    let jobClient: JenkinsClient | null = null;
    if (plan.target === 'jenkins' && input.create_jenkins_job) {
      if (!plan.jenkins?.scan_credential_id) {
        throw new AppError('jenkins_not_configured', 'A scan credential ID is required to create the Jenkins job.', 422);
      }
      jobClient = await this.jenkinsClientFor(workspaceId, input.repo);
      if (!jobClient) {
        throw new AppError('jenkins_not_configured', 'This repository has no Jenkins connection.', 422);
      }
    }

    const github = await this.container.github();
    let prUrl: string;
    let repoId: number;
    // Tracks which GitHub call is in flight so a 403/404 maps to the right error.
    let step: GitHubStep = 'repo';
    try {
      const info = await github.getRepo(plan.repoRef);
      repoId = info.id;
      // Jenkins never commits under .github/workflows/, so it never maps to pat_workflow_scope (S-AC-65).
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
          body: this.prBody(plan),
        }));
      prUrl = pr.url;
    } catch (err) {
      throw mapGitHubError(err, step);
    }

    const jenkins = plan.jenkins;
    const jenkinsColumns = jenkins
      ? {
          ciServerUrl: plan.connection ? new URL(plan.connection.url).origin : null,
          ciJobName: jenkins.job_name,
          openrouterCredentialId: jenkins.openrouter_credential_id,
          githubCredentialId: jenkins.github_credential_id,
          scanCredentialId: jenkins.scan_credential_id ?? null,
          agentLabel: jenkins.agent_label,
        }
      : {
          ciServerUrl: null,
          ciJobName: null,
          openrouterCredentialId: null,
          githubCredentialId: null,
          scanCredentialId: null,
          agentLabel: null,
        };

    const row = await this.repo.upsertInstallation({
      agentId,
      repo: input.repo,
      targetType: plan.target,
      githubRepoId: repoId,
      branch: CI_BRANCH,
      workflowPath: plan.target === 'jenkins' ? JENKINSFILE_PATH : WORKFLOW_PATH,
      workflowVersion: plan.target === 'jenkins' ? JENKINSFILE_VERSION : WORKFLOW_VERSION,
      manifestVersion: MANIFEST_VERSION,
      exportedCiFailOn: plan.agent.ciFailOn,
      postAs: input.post_as,
      triggers: input.triggers,
      prUrl,
      agentSlug: plan.slug,
      ...jenkinsColumns,
    });
    if (jenkins) {
      // Q2: job/credentials/label are repo-wide — keep every peer in step.
      await this.repo.updateJenkinsRepoSettings(workspaceId, input.repo, {
        ...jenkinsColumns,
        ciJobName: jenkins.job_name,
        openrouterCredentialId: jenkins.openrouter_credential_id,
        githubCredentialId: jenkins.github_credential_id,
        agentLabel: jenkins.agent_label,
      });
    }

    const jenkinsJob =
      jobClient && jenkins
        ? await this.createJenkinsJob(jobClient, input.repo, jenkins.job_name, jenkins.scan_credential_id!)
        : null;

    return {
      installation: toInstallationDto(row, plan.agent.ciFailOn, null, null),
      files: plan.files.map<CiFile>((f) => ({ path: f.path, contents: f.contents, editable: f.editable })),
      pr_url: prUrl,
      ...(jenkinsJob ? { jenkins_job: jenkinsJob } : {}),
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

  /** One page of runs plus the total matching the same filters. */
  async pageRuns(workspaceId: string, filters: CiRunFilters): Promise<{ items: CiRun[]; total: number }> {
    const { limit: _limit, offset: _offset, ...where } = filters;
    const [items, total] = await Promise.all([this.listRuns(workspaceId, filters), this.repo.countRuns(workspaceId, where)]);
    return { items, total };
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

    const result: CiSyncResult = { ingested: 0, failed: 0, skipped: 0, throttled: false, errors: [] };
    const installs = await this.repo.listInstallationsForWorkspace(workspaceId);
    if (installs.length > 0) {
      const github = await this.container.github();
      const ctx: SyncContext = {
        workspaceId,
        repo: this.repo,
        result,
        containsStoredSecret: (strings) => this.containsStoredSecret(strings),
      };
      const sources: Record<ExportTarget, CiRunSource> = {
        gha: new GhaRunSource(ctx, github),
        jenkins: new JenkinsRunSource(ctx, {
          connections: this.connections,
          secrets: this.container.secrets,
          jenkins: (params) => this.container.jenkins(params),
          github,
        }),
      };
      for (const inst of installs) {
        const target = inst.installation.targetType;
        if (target === 'gha' || target === 'jenkins') await sources[target].syncInstallation(inst);
      }
      await this.repo.markSynced(
        installs.map((i) => i.installation.id),
        new Date(),
      );
    }
    this.syncCache.set(workspaceId, { at: Date.now(), result });
    return result;
  }

  // ---- per-repo Jenkins connection (S-AC-70..73) -------------------------

  async getJenkinsConnection(workspaceId: string, repo: string): Promise<JenkinsConnection | null> {
    const row = await this.connections.get(workspaceId, repo);
    if (!row) return null;
    const token = await this.container.secrets.get(jenkinsTokenKey(workspaceId, repo));
    return { repo: row.repo, url: row.url, username: row.username, has_token: Boolean(token) };
  }

  async saveJenkinsConnection(workspaceId: string, input: JenkinsConnectionInput): Promise<JenkinsConnection> {
    if (!parseRepo(input.repo)) throw new ValidationError('repo must be "owner/name"');
    const url = normalizeJenkinsUrl(input.url);
    if (!url) {
      throw new ValidationError('The Jenkins URL must be http(s) with no credentials, query or fragment.');
    }
    if (input.api_token) {
      const secrets = this.container.secrets;
      if (!secrets.set) throw new ConfigError('The secrets backend is read-only.');
      await secrets.set(jenkinsTokenKey(workspaceId, input.repo), input.api_token);
    }
    await this.connections.upsert(workspaceId, input.repo, url, input.username);
    this.syncCache.delete(workspaceId);
    return (await this.getJenkinsConnection(workspaceId, input.repo))!;
  }

  async deleteJenkinsConnection(workspaceId: string, repo: string): Promise<void> {
    await this.connections.delete(workspaceId, repo);
    await this.container.secrets.delete?.(jenkinsTokenKey(workspaceId, repo));
    this.syncCache.delete(workspaceId);
  }

  /** Calls Jenkins' identity endpoint; unsaved fields override saved ones. Writes nothing. */
  async testJenkinsConnection(
    workspaceId: string,
    input: JenkinsConnectionTestInput,
  ): Promise<JenkinsConnectionTestResult> {
    const saved = await this.connections.get(workspaceId, input.repo);
    const rawUrl = input.url ?? saved?.url;
    const username = input.username ?? saved?.username;
    const token = input.api_token ?? (await this.container.secrets.get(jenkinsTokenKey(workspaceId, input.repo)));
    const url = rawUrl ? normalizeJenkinsUrl(rawUrl) : null;
    if (!url || !username || !token) {
      return {
        ok: false,
        code: 'jenkins_not_configured',
        message: 'Enter the Jenkins URL, username and API token first.',
      };
    }
    try {
      const me = await this.container.jenkins({ baseUrl: url, username, token }).whoAmI();
      return { ok: true, version: me.version, user: me.user };
    } catch (err) {
      const code = (err as { code?: string }).code;
      const mapped =
        code === 'jenkins_auth_failed' || code === 'jenkins_not_jenkins' ? code : 'jenkins_unreachable';
      return { ok: false, code: mapped, message: err instanceof Error ? err.message : 'Jenkins check failed' };
    }
  }

  // ---- planning ----------------------------------------------------------

  /** SPEC-2026-10-12-memory AC-30: memories for every agent installed on the
   *  repo (the jsonl is shared). An untracked repo exports global memories only. */
  private async exportMemory(
    workspaceId: string,
    repoFullName: string,
    agentList: { slug: string }[],
    agentId: string,
    peers: { installation: { agentId: string; agentSlug: string | null }; agentName: string }[],
  ) {
    const repoRow = await new RepoRepository(this.container.db).findByFullName(workspaceId, repoFullName);
    const idBySlug = new Map<string, string>();
    peers.forEach((p) => idBySlug.set(p.installation.agentSlug ?? slugify(p.agentName), p.installation.agentId));
    const agents = [];
    for (const { slug } of agentList) {
      const id = idBySlug.get(slug) ?? agentId;
      const linked = await this.container.agentsRepo.linkedSkills(id);
      const skillIds = linked
        .filter(
          (l) =>
            l.skill.enabled &&
            !isScanBlocking(l.skill.scanStatus as SkillScanStatus, l.skill.scanFindings as SkillScanFinding[] | null),
        )
        .map((l) => l.skill.id);
      agents.push({ slug, agentId: id, skillIds });
    }
    return new MemoryRetriever(this.container).resolveForExport(workspaceId, repoRow?.id ?? null, agents);
  }

  /** Validate the target-specific inputs (S-AC-46/48/49). */
  private checkTargetInput(input: CiExportInput): ExportTarget {
    if (input.target !== 'gha' && input.target !== 'jenkins') {
      throw new ValidationError('Only the GitHub Actions and Jenkins targets are supported');
    }
    if (input.target === 'gha') {
      if (input.jenkinsfile != null) throw new ValidationError('jenkinsfile is only valid for the Jenkins target');
      return 'gha';
    }
    if (!input.jenkins) throw new ValidationError('The Jenkins target needs the jenkins settings object');
    if (input.workflow_yaml != null) throw new ValidationError('workflow_yaml is not valid for the Jenkins target');
    const unsupported = input.triggers.filter((t) => !(JENKINS_TRIGGERS as readonly string[]).includes(t));
    if (unsupported.length > 0) {
      throw new AppError(
        'trigger_not_supported',
        `Jenkins supports only the opened and synchronize triggers (not ${unsupported.join(', ')}).`,
        422,
      );
    }
    return 'jenkins';
  }

  /** Build the file set shared by preview, export and zip. Writes nothing. */
  private async plan(workspaceId: string, agentId: string, input: CiExportInput): Promise<ExportPlan> {
    const target = this.checkTargetInput(input);
    const repoRef = parseRepo(input.repo);
    if (!repoRef) throw new ValidationError('repo must be "owner/name"');

    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    // One job/stage per agent already installed on this repo, plus this one.
    const peers = await this.repo.listInstallationsForRepo(workspaceId, input.repo);
    // S-AC-47: one target per repo — refuse before generating anything.
    const other = peers.find((p) => p.installation.targetType !== target);
    if (other) {
      throw new ConflictError(
        `${input.repo} already uses the ${other.installation.targetType === 'jenkins' ? 'Jenkins' : 'GitHub Actions'} target. One repository can use one CI target.`,
        { existing_target: other.installation.targetType },
        'ci_target_conflict',
      );
    }

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

    let pipelineFile: PlannedFile;
    let jenkins: CiJenkinsInput | null = null;
    let connection: CiJenkinsConnectionRow | null = null;
    if (target === 'jenkins') {
      const settingsIn = input.jenkins!;
      jenkins = settingsIn;
      connection = await this.connections.get(workspaceId, input.repo);
      const stageAgents = this.jenkinsStageAgents(agentList, peers, peerSlugs, slug, input.triggers);
      const settings = {
        repo: input.repo,
        agentLabel: settingsIn.agent_label,
        openrouterCredentialId: settingsIn.openrouter_credential_id,
        githubCredentialId: settingsIn.github_credential_id,
      };
      const changed = peers.filter(
        (p) =>
          p.installation.agentId !== agentId &&
          (p.installation.ciJobName !== settingsIn.job_name ||
            p.installation.openrouterCredentialId !== settingsIn.openrouter_credential_id ||
            p.installation.githubCredentialId !== settingsIn.github_credential_id ||
            p.installation.agentLabel !== settingsIn.agent_label),
      ).length;
      if (changed > 0) {
        warnings.push(
          `This changes the Jenkins job, credential or label settings for ${changed} other agent${changed === 1 ? '' : 's'} on this repository (they share one Jenkinsfile and job).`,
        );
      }
      const text = input.jenkinsfile ?? buildJenkinsfile({ agents: stageAgents, settings });
      if (input.jenkinsfile != null) {
        const violations = lintJenkinsfile(input.jenkinsfile, { agents: stageAgents, settings });
        if (violations.length > 0) throw new ValidationError('Jenkinsfile lint failed', { violations });
        await this.validateWithJenkins(workspaceId, input.repo, input.jenkinsfile, warnings);
      }
      pipelineFile = { path: JENKINSFILE_PATH, contents: text, editable: true };
    } else {
      const workflowYaml =
        input.workflow_yaml ?? buildWorkflowYaml({ agents: agentList, triggers: input.triggers });
      if (input.workflow_yaml) {
        const violations = lintWorkflow(input.workflow_yaml);
        if (violations.length > 0) throw new ValidationError('Workflow lint failed', { violations });
      }
      pipelineFile = { path: WORKFLOW_PATH, contents: workflowYaml, editable: true };
    }

    const runnerBytes = await this.container.runnerBundle.load();
    const runnerMeta = runnerMetadata(runnerBytes);

    const files: PlannedFile[] = [
      { path: manifestPath(slug), contents: manifestYaml, editable: false },
      ...skillFiles.map((s) => ({ path: s.path, contents: s.contents, editable: false })),
      { path: MEMORY_PATH, contents: buildMemoryJsonl(await this.exportMemory(workspaceId, input.repo, agentList, agentId, peers)), editable: false },
      { path: RUNNER_PATH, contents: '', editable: false, bytes: runnerBytes, metadata: runnerMeta },
      pipelineFile,
    ];

    await this.assertNoSecrets(files.filter((f) => !f.bytes));
    for (const f of files) {
      if (!f.bytes && scanForSecrets(f.contents)) {
        warnings.push(`${f.path} contains text that looks like an access token prefix. Check it before installing.`);
      }
    }

    return {
      target,
      agent,
      slug,
      repoRef,
      files,
      warnings,
      workflowAgents: agentList,
      runnerMeta,
      jenkins,
      connection,
    };
  }

  /** Each agent's stage carries its OWN installation's triggers (S-AC-50). */
  private jenkinsStageAgents(
    agentList: { name: string; slug: string }[],
    peers: InstallationWithContext[],
    peerSlugs: { agentId: string; slug: string }[],
    slug: string,
    triggers: string[],
  ): JenkinsStageAgent[] {
    const triggersBySlug = new Map<string, string[]>();
    peers.forEach((p, i) => {
      const stored = (p.installation.triggers ?? []).filter((t) =>
        (JENKINS_TRIGGERS as readonly string[]).includes(t),
      );
      triggersBySlug.set(peerSlugs[i]!.slug, stored.length > 0 ? stored : [...JENKINS_TRIGGERS]);
    });
    triggersBySlug.set(slug, triggers);
    return agentList.map((a) => ({ ...a, triggers: triggersBySlug.get(a.slug) ?? [...JENKINS_TRIGGERS] }));
  }

  /** S-AC-62: run an edited Jenkinsfile through the repo's Jenkins validator when possible. */
  private async validateWithJenkins(
    workspaceId: string,
    repo: string,
    text: string,
    warnings: string[],
  ): Promise<void> {
    const client = await this.jenkinsClientFor(workspaceId, repo);
    if (!client) {
      warnings.push('Jenkins validation was skipped: this repository has no Jenkins connection.');
      return;
    }
    let res: Awaited<ReturnType<JenkinsClient['validateJenkinsfile']>>;
    try {
      res = await client.validateJenkinsfile(text);
    } catch {
      warnings.push('Jenkins validation was skipped: Jenkins could not be reached.');
      return;
    }
    if (!res.ok) {
      const messages = res.errors.length > 0 ? res.errors : ['Jenkins rejected the Jenkinsfile.'];
      const violations: CiLintViolation[] = messages.map((message) => ({
        rule: 'jenkins_validator',
        location: JENKINSFILE_PATH,
        message,
      }));
      throw new ValidationError('Jenkins rejected the Jenkinsfile', { violations });
    }
  }

  /** A client for the repo's saved connection, or null when it is incomplete. */
  private async jenkinsClientFor(workspaceId: string, repo: string): Promise<JenkinsClient | null> {
    const conn = await this.connections.get(workspaceId, repo);
    if (!conn) return null;
    const token = await this.container.secrets.get(jenkinsTokenKey(workspaceId, repo));
    if (!token) return null;
    return this.container.jenkins({ baseUrl: conn.url, username: conn.username, token });
  }

  /** S-AC-67/69: create the multibranch job; never overwrite an existing item. */
  private async createJenkinsJob(
    client: JenkinsClient,
    repo: string,
    jobName: string,
    scanCredentialId: string,
  ): Promise<NonNullable<CiExport['jenkins_job']>> {
    try {
      const plugins = new Set(await client.listPlugins());
      if (JENKINS_REQUIRED_PLUGINS.some((p) => !plugins.has(p))) {
        return { status: 'failed', code: 'jenkins_plugin_missing' };
      }
      const existing = await client.itemClass(jobName);
      if (existing !== null) {
        return existing === JENKINS_MULTIBRANCH_CLASS
          ? { status: 'already_exists', url: client.jobUrl(jobName) }
          : { status: 'failed', code: 'jenkins_job_conflict' };
      }
      const { parent, name } = splitJobPath(jobName);
      await client.createItem(parent, name, buildJenkinsJobConfigXml({ repo, scanCredentialId }));
      return { status: 'created', url: client.jobUrl(jobName) };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'jenkins_item_exists') return { status: 'failed', code: 'jenkins_job_conflict' };
      if (code === 'jenkins_auth_failed' || code === 'jenkins_unreachable') return { status: 'failed', code };
      return { status: 'failed', code: 'jenkins_create_failed' };
    }
  }

  private prBody(plan: ExportPlan): string {
    if (plan.target === 'jenkins' && plan.jenkins) {
      return buildJenkinsPrBody({
        agents: plan.workflowAgents,
        runnerMeta: plan.runnerMeta,
        jobName: plan.jenkins.job_name,
        openrouterCredentialId: plan.jenkins.openrouter_credential_id,
        githubCredentialId: plan.jenkins.github_credential_id,
        agentLabel: plan.jenkins.agent_label,
      });
    }
    return buildPrBody({ agents: plan.workflowAgents, runnerMeta: plan.runnerMeta });
  }

  /** Every real secret value the generated files / artifacts must never contain (S-AC-7/37/85). */
  private async storedSecretValues(): Promise<string[]> {
    const keys = [
      ...GUARDED_SECRET_KEYS,
      ...(await this.connections.listAll()).map((c) => jenkinsTokenKey(c.workspaceId, c.repo)),
    ];
    const values: string[] = [];
    for (const key of keys) {
      const value = await this.container.secrets.get(key);
      if (value && value.length >= 8) values.push(value);
    }
    return values;
  }

  /** True when any string contains one of the server's real secret values. */
  private async containsStoredSecret(strings: string[]): Promise<boolean> {
    const values = await this.storedSecretValues();
    return values.some((value) => strings.some((s) => s.includes(value)));
  }

  /** Refuse to emit a file that contains one of the server's real secret values (S-AC-7). */
  private async assertNoSecrets(files: PlannedFile[]): Promise<void> {
    const values = await this.storedSecretValues();
    if (values.some((value) => files.some((f) => f.contents.includes(value)))) {
      throw new ValidationError('A generated file contains a stored secret value; remove it and retry.');
    }
  }
}

// ---- pure mapping helpers (no I/O) -----------------------------------------

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
    // Only a Fail CI on change flags an installation (A6/A14).
    out_of_date: row.exportedCiFailOn !== agentCiFailOn,
    last_run_status: lastRunStatus,
    last_run_at: lastRunAt ? lastRunAt.toISOString() : null,
    ci_server_url: row.ciServerUrl,
    ci_job_name: row.ciJobName,
    openrouter_credential_id: row.openrouterCredentialId,
    github_credential_id: row.githubCredentialId,
    scan_credential_id: row.scanCredentialId,
    agent_label: row.agentLabel,
    last_sync_error: row.lastSyncError,
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
