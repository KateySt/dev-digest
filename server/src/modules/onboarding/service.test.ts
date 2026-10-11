import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { OnboardingService } from './service.js';
import type { OnboardingRepository, OnboardingRepoBasics } from './repository.js';
import { MAX_INDEXED_FILES } from '../repo-intel/constants.js';
import { GENERATION_DEADLINE_MS, PERSIST_MARGIN_MS } from './constants.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';

/**
 * OnboardingService — ring-1 hermetic unit tests (no Docker, no Postgres).
 *
 * `OnboardingService.doGenerate`/`generate` are PRIVATE (only reachable via
 * the job handler in real use); reached here the same way
 * `test/repo-intel-resync.test.ts` reaches `RepoIntelService`'s private
 * `repo` field — cast past the access modifier rather than exporting a new
 * public surface just for tests. `service.repo` (OnboardingRepository) is
 * replaced with an in-memory stub so no DB is ever touched; `container` is a
 * plain object exposing only the ports `doGenerate` actually calls
 * (`repoIntel`, `git`, `llm`, `config`) — matching the
 * `repo-intel-facade-degraded.test.ts` / `skills-service.test.ts` pattern.
 */

interface RepoIntelStub {
  getIndexState: (repoId: string) => Promise<{
    filesIndexed: number;
    filesSkipped: number;
    status: 'full' | 'partial' | 'degraded' | 'failed';
    degradedReason?: 'flag_off' | 'index_failed' | 'index_partial' | 'repo_too_large' | 'no_data';
  }>;
  getTopFilesByRank: (repoId: string, n: number) => Promise<string[]>;
  getCriticalPaths: (repoId: string) => Promise<string[][]>;
}

const DEFAULT_INDEX_STATE = {
  filesIndexed: 10,
  filesSkipped: 0,
  status: 'full' as const,
};

function fakeSettingsDb(rows: { key: string; value: unknown }[] = []) {
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  } as unknown as Container['db'];
}

function makeService(opts: {
  basics?: OnboardingRepoBasics | null;
  repoIntel?: Partial<RepoIntelStub>;
  llm?: (id: string) => Promise<LLMProvider>;
  db?: Container['db'];
  repoIntelEnabled?: boolean;
  existingTourJson?: unknown | null;
}) {
  const upserts: { repoId: string; tour: unknown }[] = [];
  const repoIntelCalls: string[] = [];
  const enqueuedJobKinds: string[] = [];

  const repoIntel: RepoIntelStub = {
    getIndexState: async () => DEFAULT_INDEX_STATE,
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
    ...opts.repoIntel,
  };
  const wrappedRepoIntel: RepoIntelStub = {
    getIndexState: (repoId) => {
      repoIntelCalls.push('getIndexState');
      return repoIntel.getIndexState(repoId);
    },
    getTopFilesByRank: (repoId, n) => {
      repoIntelCalls.push('getTopFilesByRank');
      return repoIntel.getTopFilesByRank(repoId, n);
    },
    getCriticalPaths: (repoId) => {
      repoIntelCalls.push('getCriticalPaths');
      return repoIntel.getCriticalPaths(repoId);
    },
  };

  const repoStub = {
    getRepoBasics: async () => (opts.basics === undefined ? null : opts.basics),
    getTourJson: async () => opts.existingTourJson ?? null,
    upsertTour: async (repoId: string, tour: unknown) => {
      upserts.push({ repoId, tour });
    },
    findInFlightJob: async () => null,
  };

  const container = {
    // resolveFeatureModel (S-AC-17) always reads settings via container.db —
    // default to an empty-rows fake so every test resolves the registry
    // default unless a test deliberately supplies its own `db`.
    db: opts.db ?? fakeSettingsDb([]),
    config: { repoIntelEnabled: opts.repoIntelEnabled ?? true },
    repoIntel: wrappedRepoIntel,
    git: { currentHead: async () => 'sha-fixed' },
    llm: opts.llm ?? (async () => new MockLLMProvider('openai', { structured: validFixture() })),
    jobs: {
      enqueue: async (_ws: string, kind: string) => {
        enqueuedJobKinds.push(kind);
        return { id: 'job-enqueued' };
      },
      register: () => {},
    },
  } as unknown as Container;

  const service = new OnboardingService(container);
  (service as unknown as { repo: OnboardingRepository }).repo = repoStub as unknown as OnboardingRepository;

  return {
    service,
    upserts,
    repoIntelCalls,
    enqueuedJobKinds,
    doGenerate: (repoId: string, workspaceId: string, jobId: string) =>
      (
        service as unknown as {
          doGenerate: (repoId: string, workspaceId: string, jobId: string) => Promise<void>;
        }
      ).doGenerate(repoId, workspaceId, jobId),
  };
}

function basics(overrides: Partial<OnboardingRepoBasics> = {}): OnboardingRepoBasics {
  return {
    id: 'r1',
    owner: 'acme',
    name: 'app',
    fullName: 'acme/app',
    defaultBranch: 'main',
    clonePath: '/mock/clone',
    ...overrides,
  };
}

/** A model response fixture matching the module-private `OnboardingModelResponse`
 *  schema (8 required fields, no path-typed field — S-AC-19's structural guarantee). */
function validFixture(overrides: Record<string, unknown> = {}) {
  return {
    architecture_md: 'The app starts at its entry point.',
    critical_paths_md: 'These files anchor the app.',
    run_locally_md: 'Copy env and run the dev script.',
    reading_path_md: 'Start from the entry point.',
    first_tasks_md: 'Try adding a new route.',
    diagram_source: 'flowchart TD\nA[Client] --> B[Server]',
    reading_path_rationales: [],
    critical_path_reasons: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// S-AC-6 — a read never triggers generation.
// ---------------------------------------------------------------------------

describe('OnboardingService.getTour (S-AC-6)', () => {
  it('no stored tour, no clone → no_clone, with zero repoIntel calls and no job enqueued', async () => {
    const { service, repoIntelCalls, enqueuedJobKinds } = makeService({});

    const result = await service.getTour('r1-nonexistent');

    expect(result.state).toBe('no_clone');
    expect(repoIntelCalls).toEqual([]);
    expect(enqueuedJobKinds).toEqual([]);
  });

  it('no stored tour, clone present → not_generated, with zero repoIntel calls and no job enqueued', async () => {
    const { service, repoIntelCalls, enqueuedJobKinds } = makeService({ basics: basics() });

    const result = await service.getTour('r1');

    expect(result.state).toBe('not_generated');
    expect(enqueuedJobKinds).toEqual([]);
    expect(repoIntelCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// S-AC-9, S-AC-10, S-AC-11 — fact collection wiring against a stubbed facade.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — fact collection (S-AC-9, S-AC-10, S-AC-11)', () => {
  it('reads reading path + critical paths exclusively through the repoIntel facade (S-AC-11), preserving its order (S-AC-9)', async () => {
    // `service.repo` (the OnboardingRepository stand-in) never touches file_edges
    // or file_rank, and `container.db` here only ever answers the unrelated
    // settings lookup (S-AC-17) — so the reading-path/critical-path facts on
    // the persisted tour can only have come from the repoIntel stub below,
    // proving facade-only access (S-AC-11) by construction.
    const { doGenerate, upserts, repoIntelCalls } = makeService({
      basics: basics(),
      repoIntel: {
        getTopFilesByRank: async () => ['src/x.ts', 'src/y.ts'],
        getCriticalPaths: async () => [['src/a.ts', 'src/a.test.ts', 'src/b.ts'], ['src/x.ts', 'src/y.ts']],
      },
    });

    await doGenerate('r1', 'ws1', 'job-1');

    expect(repoIntelCalls).toEqual(
      expect.arrayContaining(['getIndexState', 'getTopFilesByRank', 'getCriticalPaths']),
    );
    const tour = upserts[0]!.tour as {
      reading_path: { position: number; path: string }[];
      critical_paths: { chain: string[] }[];
    };
    // S-AC-9 — the facade's own order is preserved (no client-side re-sort),
    // positions assigned 1..n in that order.
    expect(tour.reading_path).toEqual([
      expect.objectContaining({ position: 1, path: 'src/x.ts' }),
      expect.objectContaining({ position: 2, path: 'src/y.ts' }),
    ]);
    // S-AC-10 — the WHOLE junk-containing chain is dropped (never spliced).
    expect(tour.critical_paths).toEqual([expect.objectContaining({ chain: ['src/x.ts', 'src/y.ts'] })]);
  });
});

// ---------------------------------------------------------------------------
// S-AC-12, S-AC-13, S-AC-14 — local-run extraction, real files on disk.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — local-run extraction (S-AC-12, S-AC-13, S-AC-14)', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function tmpClone(): string {
    const dir = mkdtempSync(join(tmpdir(), 'onboarding-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  it('scripts-present: package.json scripts + .env.example → env-copy then npm run commands, keys reported verbatim', async () => {
    const clone = tmpClone();
    writeFileSync(join(clone, 'package.json'), JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } }));
    writeFileSync(join(clone, '.env.example'), 'DATABASE_URL=\nAPI_KEY=xyz\n');

    const { doGenerate, upserts } = makeService({ basics: basics({ clonePath: clone }) });
    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as {
      run_commands: { order: number; command: string; source: string }[];
      env_keys: string[];
    };
    expect(tour.run_commands).toEqual([
      { order: 1, command: 'cp .env.example .env', source: 'env_example' },
      { order: 2, command: 'npm run dev', source: 'package_json' },
      { order: 3, command: 'npm run build', source: 'package_json' },
    ]);
    expect(tour.env_keys).toEqual(['DATABASE_URL', 'API_KEY']);
  });

  it('no-scripts-block: package.json with no scripts + a compose file → only compose commands', async () => {
    const clone = tmpClone();
    writeFileSync(join(clone, 'package.json'), JSON.stringify({ name: 'app' }));
    writeFileSync(join(clone, 'docker-compose.yml'), 'services:\n  api:\n    image: node\n  db:\n    image: postgres\n');

    const { doGenerate, upserts } = makeService({ basics: basics({ clonePath: clone }) });
    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as { run_commands: { command: string; source: string }[]; env_keys: string[] };
    expect(tour.run_commands).toEqual([
      { order: 1, command: 'docker compose up api', source: 'compose' },
      { order: 2, command: 'docker compose up db', source: 'compose' },
    ]);
    expect(tour.env_keys).toEqual([]);
  });

  it('compose-only: no package.json, no .env.example → compose commands only', async () => {
    const clone = tmpClone();
    writeFileSync(join(clone, 'compose.yaml'), 'services:\n  web:\n    image: nginx\n');

    const { doGenerate, upserts } = makeService({ basics: basics({ clonePath: clone }) });
    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as { run_commands: { command: string; source: string }[] };
    expect(tour.run_commands).toEqual([{ order: 1, command: 'docker compose up web', source: 'compose' }]);
  });

  it('all-absent: none of package.json/compose/.env.example exist → empty local-run facts, no synthesized command', async () => {
    const clone = tmpClone(); // empty directory

    const { doGenerate, upserts } = makeService({ basics: basics({ clonePath: clone }) });
    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as { run_commands: unknown[]; env_keys: unknown[] };
    expect(tour.run_commands).toEqual([]);
    expect(tour.env_keys).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// S-AC-15, S-AC-23, S-AC-25, S-AC-27 — index counts + degraded-reason wiring.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — index honesty + degradation wiring (S-AC-15, S-AC-23, S-AC-25, S-AC-27)', () => {
  it('reports files_indexed and files_discovered as two distinct counts', async () => {
    const { doGenerate, upserts } = makeService({
      basics: basics(),
      repoIntel: { getIndexState: async () => ({ filesIndexed: 30, filesSkipped: 12, status: 'full' }) },
    });
    await doGenerate('r1', 'ws1', 'job-1');
    const tour = upserts[0]!.tour as { files_indexed: number; files_discovered: number };
    expect(tour.files_indexed).toBe(30);
    expect(tour.files_discovered).toBe(42); // 30 + 12, never collapsed into one figure
  });

  it.each([
    { label: 'full → healthy, no reason', state: { filesIndexed: 10, filesSkipped: 0, status: 'full' as const }, enabled: true, expected: { status: 'full', reason: null } },
    { label: 'partial → index_partial', state: { filesIndexed: 10, filesSkipped: 5, status: 'partial' as const }, enabled: true, expected: { status: 'partial', reason: 'index_partial' } },
    { label: 'failed → index_failed', state: { filesIndexed: 0, filesSkipped: 0, status: 'failed' as const }, enabled: true, expected: { status: 'failed', reason: 'index_failed' } },
    { label: 'at the file cap → repo_too_large (S-AC-27, never refuses)', state: { filesIndexed: MAX_INDEXED_FILES, filesSkipped: 100, status: 'partial' as const }, enabled: true, expected: { status: 'partial', reason: 'repo_too_large' } },
    { label: 'repoIntelEnabled=false → flag_off, regardless of raw status', state: { filesIndexed: 10, filesSkipped: 0, status: 'full' as const }, enabled: false, expected: { status: 'degraded', reason: 'flag_off' } },
  ])('$label', async ({ state, enabled, expected }) => {
    const { doGenerate, upserts } = makeService({
      basics: basics(),
      repoIntelEnabled: enabled,
      repoIntel: { getIndexState: async () => state },
    });
    await doGenerate('r1', 'ws1', 'job-1');
    const tour = upserts[0]!.tour as { index_status: string; index_degraded_reason: string | null };
    expect(tour.index_status).toBe(expected.status);
    expect(tour.index_degraded_reason).toBe(expected.reason);
  });
});

// ---------------------------------------------------------------------------
// S-AC-16, S-AC-17, S-AC-18 — the single call, model resolution, invalid response.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — the single LLM call (S-AC-16, S-AC-17, S-AC-18)', () => {
  it('makes exactly one completeStructured call for the whole tour', async () => {
    const llm = new MockLLMProvider('openai', { structured: validFixture() });
    const { doGenerate } = makeService({ basics: basics(), llm: async () => llm });

    await doGenerate('r1', 'ws1', 'job-1');

    const structuredCalls = llm.calls.filter((c) => c.method === 'completeStructured');
    expect(structuredCalls).toHaveLength(1);
  });

  it('resolves the workspace override for the onboarding feature-model when set', async () => {
    const overrideModel = new MockLLMProvider('anthropic', { structured: validFixture() });
    const registryDefaultModel = new MockLLMProvider('openrouter', { structured: validFixture() });
    const db = fakeSettingsDb([{ key: 'feature_models', value: { onboarding: { provider: 'anthropic', model: 'claude-x' } } }]);

    const { doGenerate, upserts } = makeService({
      basics: basics(),
      db,
      llm: async (id) => (id === 'anthropic' ? overrideModel : registryDefaultModel),
    });
    await doGenerate('r1', 'ws1', 'job-1');

    expect(overrideModel.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(registryDefaultModel.calls).toHaveLength(0);
    const tour = upserts[0]!.tour as { provider: string; model: string };
    expect(tour.provider).toBe('anthropic');
    expect(tour.model).toBe('claude-x');
  });

  it('falls back to the onboarding feature-model registry default when no override is set', async () => {
    const registryDefaultModel = new MockLLMProvider('openrouter', { structured: validFixture() });
    const someOtherProvider = new MockLLMProvider('openai', { structured: validFixture() });
    const db = fakeSettingsDb([]); // no rows at all → getFeatureModelOverride resolves undefined

    const { doGenerate, upserts } = makeService({
      basics: basics(),
      db,
      llm: async (id) => (id === 'openrouter' ? registryDefaultModel : someOtherProvider),
    });
    await doGenerate('r1', 'ws1', 'job-1');

    expect(registryDefaultModel.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(someOtherProvider.calls).toHaveLength(0);
    const tour = upserts[0]!.tour as { provider: string; model: string };
    expect(tour.provider).toBe('openrouter');
    expect(tour.model).toBe('deepseek/deepseek-v4-flash'); // FEATURE_MODELS registry default for 'onboarding'
  });

  it('treats a response that fails schema validation as a model failure (invalid_response), persisting the skeleton', async () => {
    // A provider that does NOT itself validate its output against the schema
    // (unlike MockLLMProvider) — this is the only way to reach doGenerate's
    // OWN post-call `OnboardingModelResponse.safeParse` failure branch, since
    // MockLLMProvider validates the exact same schema before returning.
    const badLlm: LLMProvider = {
      id: 'openai',
      listModels: async () => [],
      complete: async () => {
        throw new Error('unused');
      },
      completeStructured: async <T>(): Promise<StructuredResult<T>> => ({
        data: { unexpected: 'shape' } as unknown as T,
        model: 'gpt-4.1',
        tokensIn: 10,
        tokensOut: 5,
        costUsd: 0.001,
        raw: '{}',
        attempts: 1,
      }),
      embed: async () => [],
    };

    const { doGenerate, upserts } = makeService({ basics: basics(), llm: async () => badLlm });
    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as {
      model_failure_reason: string | null;
      architecture_md: string | null;
      reading_path: unknown[];
    };
    expect(tour.model_failure_reason).toBe('invalid_response');
    // AC-24 skeleton — prose absent, deterministic facts still present.
    expect(tour.architecture_md).toBeNull();
    expect(Array.isArray(tour.reading_path)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S-AC-19 — prose containment scan applied to prose fields, diagram_source exempt.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — S-AC-19 prose containment, diagram_source exemption', () => {
  it('strips a hallucinated path from prose but leaves the same path-shaped text untouched in diagram_source', async () => {
    const fixture = validFixture({
      architecture_md: 'See `src/allowed.ts` and `src/hallucinated.ts` for details.',
      diagram_source: 'flowchart TD\nA[src/hallucinated.ts] --> B[Server]',
    });
    const { doGenerate, upserts } = makeService({
      basics: basics(),
      repoIntel: { getTopFilesByRank: async () => ['src/allowed.ts'] },
      llm: async () => new MockLLMProvider('openai', { structured: fixture }),
    });

    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as { architecture_md: string; diagram_source: string };
    // The hallucinated path's code-span formatting is stripped in prose (inert plain text)…
    expect(tour.architecture_md).toBe('See `src/allowed.ts` and src/hallucinated.ts for details.');
    // …but diagram_source is passed through byte-for-byte — its labels are
    // conceptual, never wired to a file-open action, so it is deliberately
    // exempt from the scan (service.ts's documented S-AC-19 exemption).
    expect(tour.diagram_source).toBe(fixture.diagram_source);
  });
});

// ---------------------------------------------------------------------------
// S-AC-20 — diagram source (model-authored) + fallback (deterministic) persisted together.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — S-AC-20 diagram source + deterministic fallback', () => {
  it('persists both the model diagram source and the deterministic node/edge fallback', async () => {
    const fixture = validFixture({ diagram_source: 'flowchart TD\nA[Client] --> B[Server]' });
    const { doGenerate, upserts } = makeService({
      basics: basics(),
      repoIntel: {
        getTopFilesByRank: async () => ['src/a.ts'],
        getCriticalPaths: async () => [['src/a.ts', 'src/b.ts']],
      },
      llm: async () => new MockLLMProvider('openai', { structured: fixture }),
    });

    await doGenerate('r1', 'ws1', 'job-1');

    const tour = upserts[0]!.tour as {
      diagram_source: string;
      diagram_nodes: string[];
      diagram_edges: { from: string; to: string }[];
    };
    expect(tour.diagram_source).toBe(fixture.diagram_source);
    expect(new Set(tour.diagram_nodes)).toEqual(new Set(['src/a.ts', 'src/b.ts']));
    expect(tour.diagram_edges).toEqual([{ from: 'src/a.ts', to: 'src/b.ts' }]);
  });
});

// ---------------------------------------------------------------------------
// B9 / S-AC-32 — a hung model call is abandoned in time for the skeleton to persist.
// ---------------------------------------------------------------------------

describe('OnboardingService.doGenerate — model timeout leaves room to persist (S-AC-24, S-AC-32)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('B9 / S-AC-32: a never-resolving LLM call yields a persisted skeleton with model_failure_reason "timeout" before the deadline guard', async () => {
    // Fake only timers + Date: the clone reads before the model call are real async I/O.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    let modelCalled = false;
    const hung = {
      id: 'openai',
      completeStructured: () => {
        modelCalled = true;
        return new Promise(() => {});
      },
    } as unknown as LLMProvider;
    const { doGenerate, upserts } = makeService({
      basics: basics(),
      llm: async () => hung,
      repoIntel: { getTopFilesByRank: async () => ['src/x.ts'] },
    });

    let finished = false;
    const done = doGenerate('r1', 'ws1', 'job-hung').then(() => {
      finished = true;
    });
    // Let the real I/O before the model call finish first (bounded), so a slow
    // CI runner can't burn fake time before the hung call has even started.
    for (let i = 0; !modelCalled && i < 10_000; i++) {
      await new Promise((r) => setImmediate(r));
    }
    expect(modelCalled).toBe(true);
    // Step the fake clock in small increments, yielding to real I/O between
    // steps, but never past GENERATION_DEADLINE_MS: the skeleton must land
    // BEFORE the deadline guard (which would otherwise skip the write).
    for (let t = 0; !finished && t < GENERATION_DEADLINE_MS; t += 500) {
      await new Promise((r) => setImmediate(r));
      await vi.advanceTimersByTimeAsync(500);
    }
    await done;

    expect(upserts).toHaveLength(1);
    const tour = upserts[0]!.tour as {
      model_failure_reason: string;
      architecture_md: string | null;
      reading_path: { path: string; rationale: string | null }[];
    };
    expect(tour.model_failure_reason).toBe('timeout');
    expect(tour.architecture_md).toBeNull();
    expect(tour.reading_path).toEqual([{ position: 1, path: 'src/x.ts', rationale: null }]);
  });
});
