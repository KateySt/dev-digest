import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Container } from '../src/platform/container.js';
import { SkillsService } from '../src/modules/skills/service.js';
import { MockCatalogSource } from '../src/adapters/mocks.js';

/**
 * Hermetic fake Drizzle `db` — just enough chain surface for the calls
 * `SkillsService`/`SkillsRepository` make in these tests (`select().from()
 * .where()`, `insert().values().returning()/.onConflictDoNothing()`). No
 * real Postgres — the DB-backed paths (persistence, cascade, migration
 * behavior) are covered by the integration suite instead.
 */
function fakeDb(opts: { settingsRows?: { key: string; value: unknown }[] } = {}) {
  const insertedValues: Record<string, unknown>[] = [];
  return {
    db: {
      select: () => ({
        from: () => ({ where: async () => opts.settingsRows ?? [] }),
      }),
      insert: (_table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          insertedValues.push(values);
          return {
            returning: async () => [{ id: 'new-skill', createdAt: new Date(), ...values }],
            onConflictDoNothing: async () => undefined,
          };
        },
      }),
    },
    insertedValues,
  };
}

const LLM_STUB = {
  completeStructured: async () => ({
    data: { findings: [] },
    model: 'x',
    tokensIn: 0,
    tokensOut: 0,
    costUsd: null,
    raw: '{}',
    attempts: 1,
  }),
};

function buildContainer(opts: {
  catalogSource?: MockCatalogSource;
  settingsRows?: { key: string; value: unknown }[];
  communityCatalogRepoDefault?: string;
}): { container: Container; insertedValues: Record<string, unknown>[] } {
  const { db, insertedValues } = fakeDb({ settingsRows: opts.settingsRows });
  const container = {
    db,
    config: { communityCatalogRepoDefault: opts.communityCatalogRepoDefault ?? 'owner/catalog-repo' },
    catalogSource: opts.catalogSource ?? new MockCatalogSource(),
    llm: async () => LLM_STUB,
  } as unknown as Container;
  return { container, insertedValues };
}

describe('SkillsService.communityCatalogListing — caching (S-AC-5/S-AC-6)', () => {
  it('serves a second call from cache with zero additional tree requests', async () => {
    const catalogSource = new MockCatalogSource({
      trees: {
        'owner/catalog-repo': [
          { path: 'python', type: 'tree' },
          { path: 'python/x.md', type: 'blob' },
        ],
      },
      bodies: { 'owner/catalog-repo#python/x.md': '# X\n\nBody.' },
    });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const first = await service.communityCatalogListing('ws1');
    expect(first.available).toBe(true);
    expect(first.entries).toHaveLength(1);
    expect(catalogSource.treeCalls).toHaveLength(1);

    const second = await service.communityCatalogListing('ws1');
    expect(second.available).toBe(true);
    // Cache hit — no additional tree request.
    expect(catalogSource.treeCalls).toHaveLength(1);
  });

  it('forceRefresh discards the cache and re-fetches (S-AC-7)', async () => {
    const catalogSource = new MockCatalogSource({
      trees: { 'owner/catalog-repo': [{ path: 'python/x.md', type: 'blob' }] },
      bodies: { 'owner/catalog-repo#python/x.md': '# X' },
    });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    await service.communityCatalogListing('ws1');
    await service.communityCatalogListing('ws1', { forceRefresh: true });
    expect(catalogSource.treeCalls).toHaveLength(2);
  });

  it('resolves to an unavailable outcome (never a fixture) when the catalog cannot be reached', async () => {
    const catalogSource = new MockCatalogSource({ trees: {} }); // no fixture → throws
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const result = await service.communityCatalogListing('ws1');
    expect(result.available).toBe(false);
    expect(result.entries).toEqual([]);
    expect(result.message).toBeTruthy();
  });

  it('rejects a non-github.com catalog value before any outbound request (SSRF guard, S-AC-3)', async () => {
    const catalogSource = new MockCatalogSource();
    const { container } = buildContainer({
      catalogSource,
      communityCatalogRepoDefault: 'https://evil.example.com/a/b',
    });
    const service = new SkillsService(container);

    const result = await service.communityCatalogListing('ws1');
    expect(result.available).toBe(false);
    expect(catalogSource.treeCalls).toHaveLength(0);
  });

  it('searches case-insensitively by name/description (S-AC-15)', async () => {
    const catalogSource = new MockCatalogSource({
      trees: { 'owner/catalog-repo': [{ path: 'python/x.md', type: 'blob' }] },
      bodies: { 'owner/catalog-repo#python/x.md': '---\ndescription: Flags SECRET leaks.\n---\n# My skill' },
    });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const match = await service.communityCatalogListing('ws1', { query: 'secret' });
    expect(match.entries).toHaveLength(1);
    const noMatch = await service.communityCatalogListing('ws1', { query: 'nope' });
    expect(noMatch.entries).toHaveLength(0);
  });

  it('filters by an exact tag slug (S-AC-16)', async () => {
    const catalogSource = new MockCatalogSource({
      trees: { 'owner/catalog-repo': [{ path: 'python/x.md', type: 'blob' }] },
      bodies: { 'owner/catalog-repo#python/x.md': '# X' },
    });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    expect((await service.communityCatalogListing('ws1', { tag: 'python' })).entries).toHaveLength(1);
    expect((await service.communityCatalogListing('ws1', { tag: 'go' })).entries).toHaveLength(0);
  });
});

describe('SkillsService.suggestionsForRepo — matching thresholds (S-AC-26 – S-AC-30)', () => {
  function buildCatalog() {
    return new MockCatalogSource({
      trees: {
        'owner/catalog-repo': [
          { path: 'python/x.md', type: 'blob' },
          { path: 'go/y.md', type: 'blob' },
        ],
      },
      bodies: {
        'owner/catalog-repo#python/x.md': '# Python skill',
        'owner/catalog-repo#go/y.md': '# Go skill',
      },
    });
  }

  it('matches entries whose tags overlap a qualifying (>=5% byte-share) language', async () => {
    const { container } = buildContainer({ catalogSource: buildCatalog() });
    const service = new SkillsService(container);
    const result = await service.suggestionsForRepo('ws1', 'repo1', { Python: 950, CSS: 50 });
    expect(result.available).toBe(true);
    expect(result.entries.map((e) => e.path)).toEqual(['python/x.md']);
  });

  it('excludes a language below the 5% threshold from matching', async () => {
    const { container } = buildContainer({ catalogSource: buildCatalog() });
    const service = new SkillsService(container);
    const result = await service.suggestionsForRepo('ws1', 'repo1', { Go: 10, Python: 990 });
    // Go is below 5% (10/1000 = 1%) — only python should match.
    expect(result.entries.map((e) => e.path)).toEqual(['python/x.md']);
  });

  it('returns an empty list, not an error, for a null language breakdown (S-AC-30)', async () => {
    const { container } = buildContainer({ catalogSource: buildCatalog() });
    const service = new SkillsService(container);
    const result = await service.suggestionsForRepo('ws1', 'repo1', null);
    expect(result.available).toBe(true);
    expect(result.entries).toEqual([]);
  });

  it('never aliases typescript and javascript when matching (S-AC-29)', async () => {
    const { container } = buildContainer({
      catalogSource: new MockCatalogSource({
        trees: { 'owner/catalog-repo': [{ path: 'javascript/x.md', type: 'blob' }] },
        bodies: { 'owner/catalog-repo#javascript/x.md': '# JS skill' },
      }),
    });
    const service = new SkillsService(container);
    const result = await service.suggestionsForRepo('ws1', 'repo1', { TypeScript: 1000 });
    expect(result.entries).toEqual([]);
  });

  it('returns an empty list + unavailable indicator (not an error) when the catalog cannot be reached (S-AC-32)', async () => {
    const { container } = buildContainer({ catalogSource: new MockCatalogSource({ trees: {} }) });
    const service = new SkillsService(container);
    const result = await service.suggestionsForRepo('ws1', 'repo1', { Python: 1000 });
    expect(result.available).toBe(false);
    expect(result.entries).toEqual([]);
  });
});

describe('SkillsService.create — manual create without a project (S-AC-23)', () => {
  it('persists a null repo_id when none is given', async () => {
    const { container, insertedValues } = buildContainer({});
    const service = new SkillsService(container);

    const skill = await service.create('ws1', {
      type: 'custom',
      body: '# A skill\nBody.',
    });

    expect(skill.repo_id).toBeNull();
    expect(insertedValues[0]?.repoId).toBeNull();
  });

  it('persists the given repo_id when a project is specified', async () => {
    const { container, insertedValues } = buildContainer({});
    const service = new SkillsService(container);
    // B7 / AC-49: create now verifies ownership; the fake db can't answer that
    // query, so stub the (private) check — it is covered for real in skills.it.test.ts.
    vi.spyOn(service as never, 'repoBelongsToWorkspace' as never).mockResolvedValue(true as never);

    const skill = await service.create('ws1', {
      type: 'custom',
      body: '# A skill\nBody.',
      repoId: 'repo-42',
    });

    expect(skill.repo_id).toBe('repo-42');
    expect(insertedValues[0]?.repoId).toBe('repo-42');
  });

  it('B7 / AC-49: rejects a repo_id outside the workspace and inserts nothing', async () => {
    const { container, insertedValues } = buildContainer({});
    const service = new SkillsService(container);
    vi.spyOn(service as never, 'repoBelongsToWorkspace' as never).mockResolvedValue(false as never);

    await expect(
      service.create('ws1', { type: 'custom', body: '# A skill\nBody.', repoId: 'repo-42' }),
    ).rejects.toMatchObject({ statusCode: 422 });
    expect(insertedValues).toHaveLength(0);
  });
});

describe('SkillsService community catalog population robustness (B11)', () => {
  const TREE = [
    { path: 'python/a.md', type: 'blob' as const },
    { path: 'python/b.md', type: 'blob' as const },
    { path: 'go/c.md', type: 'blob' as const },
  ];
  const BODIES = {
    'owner/catalog-repo#python/a.md': '# Alpha',
    'owner/catalog-repo#python/b.md': '# Beta',
    'owner/catalog-repo#go/c.md': '# Gamma',
  };

  it('B11 / S-AC-54: two concurrent cold-cache listings share one population (one listTree)', async () => {
    const catalogSource = new MockCatalogSource({ trees: { 'owner/catalog-repo': TREE }, bodies: BODIES });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const [a, b] = await Promise.all([
      service.communityCatalogListing('ws1'),
      service.communityCatalogListing('ws1'),
    ]);
    expect(a.available && b.available).toBe(true);
    expect(a.entries).toHaveLength(3);
    expect(b.entries).toHaveLength(3);
    expect(catalogSource.treeCalls).toHaveLength(1);
    expect(catalogSource.bodyCalls).toHaveLength(3);
  });

  it('B11 / S-AC-52, S-AC-53: one failing body keeps all entries; the failed one gets fallback metadata', async () => {
    const { 'owner/catalog-repo#python/b.md': _omit, ...bodies } = BODIES;
    const catalogSource = new MockCatalogSource({ trees: { 'owner/catalog-repo': TREE }, bodies });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const result = await service.communityCatalogListing('ws1');
    expect(result.available).toBe(true);
    expect(result.entries).toHaveLength(3);
    const failed = result.entries.find((e) => e.path === 'python/b.md')!;
    expect(failed).toMatchObject({ name: 'b', description: '', tags: ['python'], type: 'custom', folder: 'python' });
    expect(result.entries.find((e) => e.path === 'python/a.md')!.name).toBe('Alpha');
  });

  it('B11 / S-AC-53: every body failing still reports available with fallback entries', async () => {
    const catalogSource = new MockCatalogSource({ trees: { 'owner/catalog-repo': TREE }, bodies: {} });
    const { container } = buildContainer({ catalogSource });
    const result = await new SkillsService(container).communityCatalogListing('ws1');
    expect(result.available).toBe(true);
    expect(result.entries.map((e) => e.name).sort()).toEqual(['a', 'b', 'c']);
  });

  it('B11 / S-AC-31, S-AC-53: tree failure is unavailable and is not cached as success', async () => {
    const catalogSource = new MockCatalogSource({ trees: {} });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const first = await service.communityCatalogListing('ws1');
    expect(first.available).toBe(false);
    expect(first.entries).toEqual([]);
    const second = await service.communityCatalogListing('ws1');
    expect(second.available).toBe(false);
    expect(catalogSource.treeCalls).toHaveLength(2); // retried, not served from cache
  });

  it('B11 / S-AC-6: a cache hit issues zero outbound calls', async () => {
    const catalogSource = new MockCatalogSource({ trees: { 'owner/catalog-repo': TREE }, bodies: BODIES });
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    await service.communityCatalogListing('ws1');
    const trees = catalogSource.treeCalls.length;
    const bodies = catalogSource.bodyCalls.length;
    await service.communityCatalogListing('ws1');
    expect(catalogSource.treeCalls).toHaveLength(trees);
    expect(catalogSource.bodyCalls).toHaveLength(bodies);
  });

  it('B11 / S-AC-5: body fetches respect bounded concurrency', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ path: `f/${i}.md`, type: 'blob' as const }));
    let active = 0;
    let peak = 0;
    const catalogSource = new MockCatalogSource({ trees: { 'owner/catalog-repo': many } });
    catalogSource.fetchBody = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return '# x';
    };
    const { container } = buildContainer({ catalogSource });
    const result = await new SkillsService(container).communityCatalogListing('ws1');
    expect(result.entries).toHaveLength(30);
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it('B11 / S-AC-7, S-AC-54: a population superseded by a forced refresh does not overwrite the newer cache', async () => {
    const catalogSource = new MockCatalogSource({ trees: { 'owner/catalog-repo': TREE } });
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((r) => (releaseOld = r));
    let call = 0;
    catalogSource.fetchBody = async (_repo, path) => {
      const isOld = call++ < TREE.length; // first population's bodies
      if (isOld) await oldGate;
      return `# ${isOld ? 'Old' : 'New'} ${path}`;
    };
    const { container } = buildContainer({ catalogSource });
    const service = new SkillsService(container);

    const stale = service.communityCatalogListing('ws1');
    await new Promise((r) => setTimeout(r, 0)); // let the first population start
    const fresh = await service.communityCatalogListing('ws1', { forceRefresh: true });
    expect(fresh.entries.every((e) => e.name.startsWith('New'))).toBe(true);

    releaseOld();
    await stale; // the superseded population finishes last

    const after = await service.communityCatalogListing('ws1');
    expect(after.entries.every((e) => e.name.startsWith('New'))).toBe(true);
  });
});
