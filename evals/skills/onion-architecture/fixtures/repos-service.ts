// server/src/modules/repos/service.ts
import type { GitHubClient, JobQueue, RepoStore } from '../../vendor/shared/adapters.js';

export class RepoService {
  constructor(
    private readonly repos: RepoStore,
    private readonly github: GitHubClient,
    private readonly jobs: JobQueue,
  ) {}

  list(workspaceId: string) {
    return this.repos.list(workspaceId);
  }

  async requestSync(workspaceId: string, repoId: string) {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new Error('repo not found');
    const meta = await this.github.getRepo(repo.fullName);
    await this.repos.updateDefaultBranch(repoId, meta.defaultBranch);
    await this.jobs.enqueue('repo-sync', { repoId });
  }
}
// platform/container.ts (composition root) is where these ports get their concrete adapters.
