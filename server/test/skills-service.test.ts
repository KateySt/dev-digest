import { describe, it, expect, beforeEach } from 'vitest';
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

    const skill = await service.create('ws1', {
      type: 'custom',
      body: '# A skill\nBody.',
      repoId: 'repo-42',
    });

    expect(skill.repo_id).toBe('repo-42');
    expect(insertedValues[0]?.repoId).toBe('repo-42');
  });
});
