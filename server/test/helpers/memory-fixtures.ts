import type { Embedder } from '@devdigest/shared';
import { buildApp } from '../../src/app.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../../src/adapters/mocks.js';
import * as t from '../../src/db/schema.js';
import { evalConfig, MULTI_HUNK_DIFF, REVIEW_ONE_HIT_ONE_DROP, uniq, type App } from './eval-fixtures.js';
import type { PgFixture } from './pg.js';

type Db = PgFixture['handle']['db'];

/**
 * Deterministic bag-of-words embedder: texts sharing words get a high cosine,
 * unrelated texts a low one — unlike MockEmbedder, whose vectors are identical
 * for every text (cosine 1.0 for everything).
 */
export class WordEmbedder implements Embedder {
  readonly dims = 1536;
  public calls = 0;
  async embed(texts: string[]): Promise<number[][]> {
    this.calls++;
    return texts.map((text) => {
      const v = new Array(1536).fill(0);
      for (const w of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        let h = 0;
        for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        v[h % 1536] += 1;
      }
      return v;
    });
  }
}

/** An embedder whose every call fails (no key / network down). */
export class FailingEmbedder implements Embedder {
  readonly dims = 1536;
  async embed(): Promise<number[][]> {
    throw new Error('embedding service unavailable');
  }
}

/**
 * App for memory suites. `embedder: null` (default) = embeddings DISABLED
 * (no override + EMBEDDINGS_ENABLED unset → container.embedder() throws), i.e.
 * the full-text path.
 */
export async function makeMemoryApp(
  pg: PgFixture,
  opts: { embedder?: Embedder | null; llm?: MockLLMProvider } = {},
): Promise<App> {
  const llm = opts.llm ?? new MockLLMProvider('openai', { structured: REVIEW_ONE_HIT_ONE_DROP });
  const overrides: Record<string, unknown> = {
    git: new MockGitClient({ diff: MULTI_HUNK_DIFF }),
    github: new MockGitHubClient(),
    llm: { openai: llm, openrouter: llm },
  };
  if (opts.embedder) overrides.embedder = opts.embedder;
  return (await buildApp({
    config: { ...evalConfig(), embeddingsEnabled: false },
    db: pg.handle.db,
    overrides,
  })) as unknown as App;
}

export async function insertRepo(db: Db, workspaceId: string) {
  const name = uniq('memrepo');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

export function memoryBody(over: Record<string, unknown> = {}) {
  return {
    content: 'Do not flag try/catch around JSON.parse — intentional defensive parsing in this repo.',
    kind: 'learning',
    scope: 'global',
    repo_id: null,
    applies_to_all_agents: true,
    ...over,
  };
}
