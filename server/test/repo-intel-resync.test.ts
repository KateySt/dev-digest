/**
 * Manual resync — `RepoIntelService.resyncRepo`.
 *
 * Resync = fetch latest from origin (advance the clone), THEN delegate to the
 * incremental indexer. These tests assert the WIRING:
 *   - git.sync is called with the repo's `default_branch` before indexing
 *     (a resync, never a re-clone),
 *   - it degrades (never throws) when there's no clone or the fetch fails.
 *
 * The incremental slice itself is covered by indexer-pipeline.test.ts, so the
 * happy path here takes the cheap `sha_unchanged` branch — it exercises the
 * sync→delegate handoff without re-running the parse.
 */
import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MockGitClient } from '../src/adapters/mocks.js';
import { INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';
import type { RepoIntelRepository } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import type { Container } from '../src/platform/container.js';

interface Basics {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}

/** Build a service with a stubbed repository (no DB) + a MockGitClient. */
function makeService(opts: {
  basics: Basics | null;
  state?: IndexState | null;
  git: MockGitClient;
  modified?: string[];
  inWorkspace?: boolean;
}) {
  let state = opts.state ?? null;
  const touched = { n: 0 };
  const merged: Array<Record<string, unknown>> = [];
  const cleared: string[] = [];
  const repo = {
    getRepoBasics: async () => opts.basics,
    tryGetIndexState: async () => state,
    repoInWorkspace: async () => opts.inWorkspace ?? true,
    mergeIndexStats: async (_id: string, patch: Record<string, unknown>) => {
      merged.push(patch);
    },
    clearIndexStatsReason: async (_id: string, prefix: string) => {
      cleared.push(prefix);
    },
    touchIndexState: async () => {
      touched.n += 1;
      if (state) state = { ...state, updatedAt: new Date() };
    },
  } as unknown as RepoIntelRepository;

  const container = {
    git: opts.git,
    db: {}, // never queried — service.repo is overridden below
    depgraph: { buildEdges: async () => [] },
    tokenizer: { count: (text: string) => Math.ceil(text.length / 4) },
    // SPEC-04 S-AC-28 — resyncRepo consults this before advancing the clone;
    // no locally-modified project-context docs in these fixtures.
    gitStatus: { modifiedPaths: async () => opts.modified ?? [] },
  } as unknown as Container;

  const service = new RepoIntelService(container);
  (service as unknown as { repo: RepoIntelRepository }).repo = repo;
  return { service, touched, merged, cleared };
}

function stateAt(sha: string): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 3,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: sha,
    indexerVersion: INDEXER_VERSION,
    updatedAt: new Date(),
  };
}

describe('RepoIntelService.resyncRepo', () => {
  it('fetches the default branch, then delegates to the incremental indexer', async () => {
    const git = new MockGitClient({ head: 'sha-1', syncedHead: 'sha-1' });
    const { service, touched } = makeService({
      basics: { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'develop', clonePath: '/mock/clone' },
      state: stateAt('sha-1'),
      git,
    });

    const result = await service.resyncRepo('r1');

    // Resync advanced the clone against the repo's own default branch…
    expect(git.syncs).toHaveLength(1);
    expect(git.syncs[0]!.branch).toBe('develop');
    // …and the incremental pass ran (sha unchanged → touched, no error).
    expect(result.reason).toBe('sha_unchanged');
    expect(touched.n).toBe(1);
  });

  it('degrades to no_clone WITHOUT fetching when the repo is not cloned', async () => {
    const git = new MockGitClient({});
    const { service } = makeService({
      basics: { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: null },
      git,
    });

    const result = await service.resyncRepo('r1');

    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('no_clone');
    expect(git.syncs).toHaveLength(0);
  });

  it('degrades to sync_failed (never throws) when the fetch errors', async () => {
    const git = new MockGitClient({});
    git.sync = async () => {
      throw new Error('network down');
    };
    const { service } = makeService({
      basics: { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/mock/clone' },
      git,
    });

    const result = await service.resyncRepo('r1');

    expect(result.status).toBe('degraded');
    expect(result.reason).toMatch(/^sync_failed:/);
  });

  it('B6 / S-AC-36: an in-job refusal does NOT sync, merges the reason into stats, leaves status untouched', async () => {
    const git = new MockGitClient({ head: 'sha-1', syncedHead: 'sha-2' });
    const { service, merged, cleared, touched } = makeService({
      basics: { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/mock/clone' },
      state: stateAt('sha-1'),
      git,
      modified: ['docs/guide.md', 'src/unrelated.ts', 'specs/a.md'],
    });

    const result = await service.resyncRepo('r1');

    expect(git.syncs).toHaveLength(0);
    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('project_context_blocked:docs/guide.md,specs/a.md');
    // Reason persisted via mergeIndexStats only (no upsert / status change / touch).
    expect(merged).toEqual([{ reason: 'project_context_blocked:docs/guide.md,specs/a.md' }]);
    expect(cleared).toHaveLength(0);
    expect(touched.n).toBe(0);
  });

  it('B6 / S-AC-37: a successful advance clears the persisted refusal reason', async () => {
    const git = new MockGitClient({ head: 'sha-1', syncedHead: 'sha-1' });
    const { service, cleared } = makeService({
      basics: { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/mock/clone' },
      state: stateAt('sha-1'),
      git,
    });

    await service.resyncRepo('r1');

    expect(git.syncs).toHaveLength(1);
    expect(cleared).toEqual(['project_context_blocked:']);
  });
});

describe('RepoIntelService.findResyncBlockers', () => {
  const basics = { id: 'r1', owner: 'acme', name: 'app', defaultBranch: 'main', clonePath: '/mock/clone' };

  it('B6 / S-AC-35: returns only project-context paths that are modified', async () => {
    const { service } = makeService({
      basics,
      git: new MockGitClient({}),
      modified: ['docs/a.md', 'src/x.ts', 'insights/b.md'],
    });
    expect(await service.findResyncBlockers('w1', 'r1')).toEqual(['docs/a.md', 'insights/b.md']);
  });

  it('B6: returns null for a repo outside the workspace and [] when there is no clone', async () => {
    const foreign = makeService({ basics, git: new MockGitClient({}), inWorkspace: false });
    expect(await foreign.service.findResyncBlockers('w1', 'r1')).toBeNull();
    const noClone = makeService({ basics: { ...basics, clonePath: null }, git: new MockGitClient({}) });
    expect(await noClone.service.findResyncBlockers('w1', 'r1')).toEqual([]);
  });
});
