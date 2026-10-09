import { describe, it, expect } from 'vitest';
import {
  buildDiagramFallback,
  buildRunCommands,
  deriveIndexDegradation,
  filterJunkChains,
  formatChain,
  isJunkPath,
  parseComposeServiceNames,
  parseEnvExampleKeys,
  parsePackageJsonScripts,
  scanAndSanitizeProse,
  scanProseFieldsForHallucinatedPaths,
  zipCriticalPathReasons,
  zipReadingPathRationales,
} from './helpers.js';

describe('isJunkPath / filterJunkChains (S-AC-10, S-AC-11)', () => {
  it('flags tests/configs/migrations/fixtures as junk', () => {
    expect(isJunkPath('src/foo.test.ts')).toBe(true);
    expect(isJunkPath('src/foo.spec.ts')).toBe(true);
    expect(isJunkPath('src/types.d.ts')).toBe(true);
    expect(isJunkPath('src/__tests__/foo.ts')).toBe(true);
    expect(isJunkPath('db/migrations/0001_init.ts')).toBe(true);
    expect(isJunkPath('vitest.config.ts')).toBe(true);
  });

  it('does not flag ordinary source files', () => {
    expect(isJunkPath('src/modules/onboarding/service.ts')).toBe(false);
    expect(isJunkPath('src/db/schema.ts')).toBe(false);
  });

  it('drops the WHOLE chain when any node is junk, never splices a middle node', () => {
    const chains = [
      ['src/a.ts', 'src/a.test.ts', 'src/b.ts'],
      ['src/x.ts', 'src/y.ts'],
    ];
    expect(filterJunkChains(chains)).toEqual([['src/x.ts', 'src/y.ts']]);
  });
});

describe('formatChain', () => {
  it('renders a → b → c', () => {
    expect(formatChain(['a.ts', 'b.ts', 'c.ts'])).toBe('a.ts → b.ts → c.ts');
  });
});

describe('parsePackageJsonScripts (S-AC-12)', () => {
  it('reads script names in declared order', () => {
    const content = JSON.stringify({ scripts: { dev: 'next dev', build: 'next build' } });
    expect(parsePackageJsonScripts(content)).toEqual(['dev', 'build']);
  });

  it('returns [] for malformed JSON or no scripts block (S-AC-14)', () => {
    expect(parsePackageJsonScripts('not json')).toEqual([]);
    expect(parsePackageJsonScripts('{}')).toEqual([]);
  });
});

describe('parseComposeServiceNames (S-AC-12)', () => {
  it('reads top-level service names under services:', () => {
    const content = [
      'version: "3"',
      'services:',
      '  api:',
      '    image: node',
      '  db:',
      '    image: postgres',
      'volumes:',
      '  data:',
    ].join('\n');
    expect(parseComposeServiceNames(content)).toEqual(['api', 'db']);
  });

  it('returns [] when there is no services block', () => {
    expect(parseComposeServiceNames('volumes:\n  data:\n')).toEqual([]);
  });
});

describe('parseEnvExampleKeys (S-AC-13)', () => {
  it('reports every declared key verbatim and unfiltered, deduped', () => {
    const content = ['# comment', 'DATABASE_URL=', 'API_KEY=xyz', '', 'DATABASE_URL=dup'].join('\n');
    expect(parseEnvExampleKeys(content)).toEqual(['DATABASE_URL', 'API_KEY']);
  });
});

describe('buildRunCommands (S-AC-12, S-AC-14)', () => {
  it('emits nothing when all three sources are absent', () => {
    expect(
      buildRunCommands({ packageJsonContent: null, composeContent: null, envExampleContent: null }, 20),
    ).toEqual([]);
  });

  it('orders env copy, then package.json scripts, then compose services', () => {
    const pkg = JSON.stringify({ scripts: { dev: 'next dev' } });
    const compose = 'services:\n  db:\n    image: postgres\n';
    const out = buildRunCommands(
      { packageJsonContent: pkg, composeContent: compose, envExampleContent: 'KEY=' },
      20,
    );
    expect(out).toEqual([
      { order: 1, command: 'cp .env.example .env', source: 'env_example' },
      { order: 2, command: 'npm run dev', source: 'package_json' },
      { order: 3, command: 'docker compose up db', source: 'compose' },
    ]);
  });
});

describe('deriveIndexDegradation (S-AC-15, S-AC-23, S-AC-25, S-AC-27)', () => {
  it('flags flag_off FIRST regardless of the raw index status', () => {
    expect(
      deriveIndexDegradation({
        repoIntelEnabled: false,
        status: 'full',
        filesIndexed: 10,
        maxIndexedFiles: 5000,
      }),
    ).toEqual({ status: 'degraded', reason: 'flag_off' });
  });

  it('is healthy (no reason) for a full index', () => {
    expect(
      deriveIndexDegradation({
        repoIntelEnabled: true,
        status: 'full',
        filesIndexed: 10,
        maxIndexedFiles: 5000,
      }),
    ).toEqual({ status: 'full', reason: null });
  });

  it('marks partial as degraded with index_partial (unlike repo-intel\'s own facade)', () => {
    expect(
      deriveIndexDegradation({
        repoIntelEnabled: true,
        status: 'partial',
        filesIndexed: 10,
        maxIndexedFiles: 5000,
      }),
    ).toEqual({ status: 'partial', reason: 'index_partial' });
  });

  it('reports repo_too_large when filesIndexed hits the cap', () => {
    expect(
      deriveIndexDegradation({
        repoIntelEnabled: true,
        status: 'partial',
        filesIndexed: 5000,
        maxIndexedFiles: 5000,
      }),
    ).toEqual({ status: 'partial', reason: 'repo_too_large' });
  });

  it('never refuses — always returns a status+reason, even for failed', () => {
    expect(
      deriveIndexDegradation({
        repoIntelEnabled: true,
        status: 'failed',
        filesIndexed: 0,
        maxIndexedFiles: 5000,
      }),
    ).toEqual({ status: 'failed', reason: 'index_failed' });
  });
});

describe('zipReadingPathRationales / zipCriticalPathReasons (step 7b defensive zip)', () => {
  it('zips index-aligned, never discards the tour on a short/long mismatch', () => {
    const entries = [
      { position: 1, path: 'a.ts' },
      { position: 2, path: 'b.ts' },
    ];
    expect(zipReadingPathRationales(entries, ['because a'])).toEqual([
      { position: 1, path: 'a.ts', rationale: 'because a' },
      { position: 2, path: 'b.ts', rationale: null },
    ]);
    expect(zipReadingPathRationales(entries, undefined)).toEqual([
      { position: 1, path: 'a.ts', rationale: null },
      { position: 2, path: 'b.ts', rationale: null },
    ]);
  });

  it('same defensive zip for critical-path reasons', () => {
    const chains = [['a.ts', 'b.ts']];
    expect(zipCriticalPathReasons(chains, ['why'])).toEqual([{ chain: ['a.ts', 'b.ts'], reason: 'why' }]);
    expect(zipCriticalPathReasons(chains, [])).toEqual([{ chain: ['a.ts', 'b.ts'], reason: null }]);
  });
});

describe('scanAndSanitizeProse (S-AC-19 post-parse containment scan)', () => {
  const allowed = new Set(['src/allowed.ts']);

  it('strips code-span formatting from a path not in the fact set', () => {
    const md = 'See `src/allowed.ts` and `src/hallucinated.ts` for details.';
    const result = scanAndSanitizeProse(md, allowed);
    expect(result.text).toBe('See `src/allowed.ts` and src/hallucinated.ts for details.');
    expect(result.strippedCount).toBe(1);
    expect(result.detectedCount).toBe(0);
  });

  it('detects (never mutates) a plain-text path-shaped substring outside the fact set', () => {
    const md = 'The file src/hallucinated.ts handles this.';
    const result = scanAndSanitizeProse(md, allowed);
    expect(result.text).toBe(md);
    expect(result.detectedCount).toBe(1);
    expect(result.strippedCount).toBe(0);
  });

  it('leaves an allowed path alone in both code and plain text', () => {
    const md = 'See `src/allowed.ts`. Also src/allowed.ts appears in prose.';
    const result = scanAndSanitizeProse(md, allowed);
    expect(result.text).toBe(md);
    expect(result.strippedCount).toBe(0);
    expect(result.detectedCount).toBe(0);
  });

  it('combines strip+detect counts across every prose field except diagram_source', () => {
    const summary = scanProseFieldsForHallucinatedPaths(
      {
        architecture_md: 'Uses `src/bad.ts`.',
        critical_paths_md: null,
        run_locally_md: 'Run from src/other.ts context.',
        reading_path_md: null,
        first_tasks_md: null,
      },
      allowed,
    );
    expect(summary.strippedCount).toBe(1);
    expect(summary.detectedCount).toBe(1);
  });
});

describe('buildDiagramFallback (S-AC-20)', () => {
  it('builds nodes from reading path + chains, edges from chain adjacency, deduped', () => {
    const result = buildDiagramFallback(['a.ts', 'b.ts'], [
      ['a.ts', 'c.ts'],
      ['a.ts', 'c.ts'],
    ]);
    expect(new Set(result.nodes)).toEqual(new Set(['a.ts', 'b.ts', 'c.ts']));
    expect(result.edges).toEqual([{ from: 'a.ts', to: 'c.ts' }]);
  });
});
