import { eq, and } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { CiRepository, type CiRunFilters } from './repository.js';
import { buildAgentConfig, buildWorkflowYaml, slugify } from './helpers.js';
import { CI_TARGET_TYPE, DEFAULT_BASE_BRANCH, PR_TITLE, ciBranch, configPath, workflowPath } from './constants.js';
import { ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';

export interface CiFile {
  path: string;
  content: string;
}

/**
 * ci service. Backs the Agent Editor's CI tab, the Publish dialog, and the
 * global CI Runs page. "Publish to CI" and "Update CI" are the SAME action
 * (`publish`) — `commitFiles`/`findOpenPr` are idempotent by design, so a
 * re-publish just adds a commit and reuses the already-open PR.
 */
export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  /** Generate the two files "Publish to CI" would commit — no side effects. */
  async preview(workspaceId: string, agentId: string): Promise<CiFile[]> {
    const { agent, skillBodies } = await this.loadAgentAndSkills(workspaceId, agentId);
    const slug = slugify(agent.name);
    return [
      { path: workflowPath(slug), content: buildWorkflowYaml(slug, agent.provider) },
      { path: configPath(slug), content: buildAgentConfig(agent, skillBodies) },
    ];
  }

  async listForAgent(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const rows = await this.repo.listInstallations(agentId);
    return rows.map((r) => ({
      id: r.id,
      repo: r.repo,
      target_type: r.targetType,
      installed_at: r.installedAt.toISOString(),
    }));
  }

  async listRuns(workspaceId: string, filters: CiRunFilters) {
    const rows = await this.repo.listRuns(workspaceId, filters);
    return rows.map((r) => ({
      id: r.run.id,
      agent_id: r.agentId,
      agent_name: r.agentName,
      repo: r.repo,
      pr_number: r.run.prNumber,
      ran_at: r.run.ranAt ? r.run.ranAt.toISOString() : null,
      status: r.run.status,
      findings_count: r.run.findingsCount,
      cost_usd: r.run.costUsd,
      github_url: r.run.githubUrl,
      source: r.run.source,
    }));
  }

  /** Commit the workflow + config, open (or reuse) a PR, record the
   *  installation. Real external side effects — only ever exercised in
   *  tests against `MockGitHubClient`. */
  async publish(workspaceId: string, agentId: string, repoFullName: string) {
    const parsed = parseRepo(repoFullName);
    if (!parsed) throw new ValidationError('repo must be "owner/name"');

    const { agent, skillBodies } = await this.loadAgentAndSkills(workspaceId, agentId);
    const slug = slugify(agent.name);
    const branch = ciBranch(slug);
    const base = await this.resolveBaseBranch(workspaceId, repoFullName);

    let github;
    try {
      github = await this.container.github();
    } catch (err) {
      throw new ValidationError(`GitHub is not configured: ${(err as Error).message}`);
    }

    try {
      await github.commitFiles(parsed, {
        branch,
        base,
        message: `Add DevDigest CI review for ${agent.name}`,
        files: [
          { path: workflowPath(slug), contents: buildWorkflowYaml(slug, agent.provider) },
          { path: configPath(slug), contents: buildAgentConfig(agent, skillBodies) },
        ],
      });

      const existingPr = await github.findOpenPr(parsed, branch);
      const pr =
        existingPr ??
        (await github.openPullRequest(parsed, {
          title: PR_TITLE,
          head: branch,
          base,
          body: `Adds a DevDigest CI review workflow for **${agent.name}** — runs automatically on every pull request in this repo.`,
        }));

      const installation = await this.repo.upsertInstallation(agentId, repoFullName, CI_TARGET_TYPE);
      return { url: pr.url, republished: !!existingPr, installed_at: installation.installedAt.toISOString() };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ExternalServiceError(`GitHub publish failed: ${(err as Error).message}`);
    }
  }

  private async loadAgentAndSkills(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const linkedSkills = await this.container.agentsRepo.linkedSkills(agentId);
    const skillBodies = linkedSkills.filter((l) => l.skill.enabled).map((l) => l.skill.body);
    return { agent, skillBodies };
  }

  private async resolveBaseBranch(workspaceId: string, repoFullName: string): Promise<string> {
    const [row] = await this.container.db
      .select({ defaultBranch: t.repos.defaultBranch })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, repoFullName)));
    return row?.defaultBranch ?? DEFAULT_BASE_BRANCH;
  }
}

function parseRepo(repoFullName: string): { owner: string; name: string } | null {
  const parts = repoFullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}
