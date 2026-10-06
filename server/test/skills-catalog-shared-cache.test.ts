import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import type { Db } from '../src/db/client.js';
import * as t from '../src/db/schema.js';
import { RepoService } from '../src/modules/repos/service.js';
import { MockCatalogSource } from '../src/adapters/mocks.js';

/**
 * Architecture-review fix (CRITICAL, SPEC-07): `SkillsService.catalogCache`
 * must be shared across EVERY call site, not just within one hand-built
 * `SkillsService` instance (that narrower guarantee is already covered by
 * `skills-service.test.ts`). `repos/service.ts`'s `skillSuggestions()` and
 * `settings/routes.ts`'s catalog-test handler used to construct their OWN
 * `new SkillsService(container)` per request, so the TTL cache was silently
 * bypassed on those two paths — this test drives the bug through the actual
 * production code paths (`Container.skillsService`, `RepoService`) instead
 * of constructing a `SkillsService` directly, which is exactly the gap that
 * let the bug ship undetected.
 *
 * Hermetic fake `db` — just enough chain surface for the calls these paths
 * make (`select().from().where()`), branching on the table identity so a
 * repo lookup and a settings/skills lookup can return different fixtures.
 */
function fakeDb(repoRow: Record<string, unknown>): Db {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => (table === t.repos ? [repoRow] : []),
      }),
    }),
  } as unknown as Db;
}

function buildContainer(catalogSource: MockCatalogSource, repoRow: Record<string, unknown>): Container {
  const config = loadConfig({ COMMUNITY_CATALOG_REPO: 'owner/catalog-repo' } as NodeJS.ProcessEnv);
  return new Container(config, fakeDb(repoRow), { catalogSource });
}

describe('SkillsService catalog cache — shared across call sites (architecture fix)', () => {
  it('container.skillsService is memoized — one instance per process, not per access', () => {
    const container = buildContainer(new MockCatalogSource(), {});
    expect(container.skillsService).toBe(container.skillsService);
  });

  it('RepoService.skillSuggestions() reuses the cache across repeated calls (was bypassed via `new SkillsService` per request)', async () => {
    const catalogSource = new MockCatalogSource({
      trees: {
        'owner/catalog-repo': [{ path: 'python/x.md', type: 'blob' }],
      },
      bodies: { 'owner/catalog-repo#python/x.md': '# Python skill' },
    });
    const repoRow = { id: 'repo1', workspaceId: 'ws1', languages: { Python: 1000 } };
    const container = buildContainer(catalogSource, repoRow);
    const repoService = new RepoService(container);

    const first = await repoService.skillSuggestions('ws1', 'repo1');
    expect(first.available).toBe(true);
    expect(first.entries.map((e) => e.path)).toEqual(['python/x.md']);
    expect(catalogSource.treeCalls).toHaveLength(1);
    expect(catalogSource.bodyCalls).toHaveLength(1);

    // Second call through the SAME real construction path a repeated page
    // mount would take (RepoService built fresh per request, same Container)
    // must hit the shared cache — zero additional tree/body fetches.
    const second = await repoService.skillSuggestions('ws1', 'repo1');
    expect(second.available).toBe(true);
    expect(catalogSource.treeCalls).toHaveLength(1);
    expect(catalogSource.bodyCalls).toHaveLength(1);
  });

  it('a catalog-test style call (settings/routes.ts path) populates the SAME cache that skill-suggestions (repos/service.ts path) then reads from', async () => {
    const catalogSource = new MockCatalogSource({
      trees: {
        'owner/catalog-repo': [{ path: 'python/x.md', type: 'blob' }],
      },
      bodies: { 'owner/catalog-repo#python/x.md': '# Python skill' },
    });
    const repoRow = { id: 'repo1', workspaceId: 'ws1', languages: { Python: 1000 } };
    const container = buildContainer(catalogSource, repoRow);

    // Exactly what settings/routes.ts's `/settings/catalog-test` handler does.
    const testResult = await container.skillsService.testCatalogConnection('ws1');
    expect(testResult.ok).toBe(true);
    expect(catalogSource.treeCalls).toHaveLength(1);

    // Exactly what repos/service.ts's `skillSuggestions()` does, via a
    // freshly-constructed RepoService (as happens on every request) — must
    // reuse the cache the settings path just populated, not re-fetch.
    const repoService = new RepoService(container);
    const suggestions = await repoService.skillSuggestions('ws1', 'repo1');
    expect(suggestions.available).toBe(true);
    expect(catalogSource.treeCalls).toHaveLength(1);
  });
});
