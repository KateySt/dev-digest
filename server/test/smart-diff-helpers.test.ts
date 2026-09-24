import { describe, it, expect } from 'vitest';
import { classifyFile, buildFindingLinesByPath, buildGroups } from '../src/modules/smart-diff/helpers.js';
import { ROLE_ORDER } from '../src/modules/smart-diff/constants.js';

/**
 * `classifyFile()` unit table — this IS the specification of correctness for
 * smart-diff grouping, not an afterthought. Several rows are deliberate
 * judgement calls (group-order precedence, or "no rule covers this, falls to
 * core") — each is commented at the row so a future edit to
 * `CLASSIFICATION_RULES` has to consciously break them, not accidentally.
 */
describe('classifyFile', () => {
  it.each([
    // ---- boilerplate ----
    ['pnpm-lock.yaml', 'boilerplate'],
    ['client/package-lock.json', 'boilerplate'],
    ['server/dist/index.js', 'boilerplate'], // dist/** beats the index.js barrel rule (boilerplate group precedes wiring)
    ['client/src/x.min.js', 'boilerplate'],
    ['server/src/api.generated.ts', 'boilerplate'],
    [
      'client/src/__tests__/__snapshots__/x.snap',
      'boilerplate',
    ], // Disputed #1 — __snapshots__/** ranks above the tests rules (boilerplate group precedes tests group), even though the path sits under __tests__/

    // ---- tests ----
    ['server/test/contracts.test.ts', 'tests'],
    ['server/test/reviews.it.test.ts', 'tests'],
    ['client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx', 'tests'],
    ['server/test/helpers/pg.ts', 'tests'], // matched by **/test/**, not by extension
    ['e2e/specs/pr.flow.json', 'tests'],
    ['e2e/README.md', 'tests'], // Disputed #3 — e2e/** precedes the docs rule (tests group precedes docs group); deliberate

    // ---- wiring ----
    ['server/src/modules/index.ts', 'wiring'], // barrel
    ['client/next.config.ts', 'wiring'],
    ['server/tsconfig.json', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/client.yml', 'wiring'],
    ['.env.example', 'wiring'],
    ['.claude/skills/security/SKILL.md', 'wiring'], // Disputed #2 — .claude/** ranks above the docs *.md rule (wiring group precedes docs group)

    // ---- docs ----
    ['README.md', 'docs'],
    ['docs/agent-prompts/README.md', 'docs'],
    ['CHANGELOG.md', 'docs'],
    ['LICENSE', 'docs'],
    ['server/AGENTS.md', 'docs'], // judgement call — not under .claude/, so it falls through to the generic docs *.md rule

    // ---- core (fallback) ----
    ['server/src/modules/reviews/service.ts', 'core'],
    ['client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx', 'core'],
    ['server/src/db/schema/reviews.ts', 'core'],
    ['server/src/db/migrations/0014_familiar_rhino.sql', 'core'], // judgement call — no rule covers migrations/**, left as core on purpose
  ] as const)('%s → %s', (path, expected) => {
    expect(classifyFile(path)).toBe(expected);
  });

  it('normalizes backslash path separators (Windows checkout) before matching', () => {
    expect(classifyFile('server\\test\\contracts.test.ts')).toBe('tests');
    expect(classifyFile('.github\\workflows\\client.yml')).toBe('wiring');
  });
});

describe('buildFindingLinesByPath', () => {
  it('dedupes + sorts start_line per file across all findings passed in', () => {
    const map = buildFindingLinesByPath([
      { file: 'a.ts', startLine: 52 },
      { file: 'a.ts', startLine: 28 },
      { file: 'a.ts', startLine: 28 }, // duplicate — e.g. flagged by two agent runs
      { file: 'b.ts', startLine: 5 },
    ]);
    expect(map.get('a.ts')).toEqual([28, 52]);
    expect(map.get('b.ts')).toEqual([5]);
    expect(map.get('c.ts')).toBeUndefined();
  });
});

describe('buildGroups', () => {
  it('emits all 5 role groups in ROLE_ORDER even when a role has no files', () => {
    const groups = buildGroups(
      [
        { path: 'src/service.ts', additions: 10, deletions: 2 },
        { path: 'test/service.test.ts', additions: 20, deletions: 0 },
      ],
      new Map([['src/service.ts', [4]]]),
    );
    expect(groups.map((g) => g.role)).toEqual(ROLE_ORDER);
    const core = groups.find((g) => g.role === 'core')!;
    expect(core.files).toEqual([
      { path: 'src/service.ts', pseudocode_summary: null, additions: 10, deletions: 2, finding_lines: [4] },
    ]);
    const wiring = groups.find((g) => g.role === 'wiring')!;
    expect(wiring.files).toEqual([]);
  });
});
