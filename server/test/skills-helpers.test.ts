import { describe, it, expect } from 'vitest';
import {
  toSkillDto,
  isBodyChange,
  nameFromMarkdown,
  toSkillVersionListItem,
  computeSkillStats,
  computeSkillUsageSummaries,
  parseCatalogRepoValue,
  languageNameToSlug,
  qualifyingLanguageSlugs,
} from '../src/modules/skills/helpers.js';
import type { AgentSkillLinkRow, SkillFindingOutcomeRow } from '../src/modules/skills/repository.js';
import type { AgentRunRow, SkillRow, SkillVersionRow } from '../src/db/rows.js';

const ROW: SkillRow = {
  id: 's1',
  workspaceId: 'ws1',
  name: 'no-then-chains',
  description: 'Flags .then() chains.',
  type: 'convention',
  source: 'manual',
  body: '# Rule\nPrefer async/await.',
  enabled: true,
  version: 2,
  evidenceFiles: null,
  scanStatus: 'clean',
  scanFindings: null,
  scannedAt: null,
  repoId: null,
  tags: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('toSkillDto', () => {
  it('maps a skill row to the public DTO', () => {
    expect(toSkillDto(ROW)).toEqual({
      id: 's1',
      name: 'no-then-chains',
      description: 'Flags .then() chains.',
      type: 'convention',
      source: 'manual',
      body: '# Rule\nPrefer async/await.',
      enabled: true,
      version: 2,
      evidence_files: null,
      scan_status: 'clean',
      scan_findings: null,
      scanned_at: null,
      repo_id: null,
      tags: null,
    });
  });

  it('passes through evidence_files when present', () => {
    const dto = toSkillDto({ ...ROW, evidenceFiles: ['src/a.ts:12'] });
    expect(dto.evidence_files).toEqual(['src/a.ts:12']);
  });

  it('passes through repo_id and tags when present (SPEC-07)', () => {
    const dto = toSkillDto({ ...ROW, repoId: 'repo-1', tags: ['python', 'testing'] });
    expect(dto.repo_id).toBe('repo-1');
    expect(dto.tags).toEqual(['python', 'testing']);
  });
});

describe('parseCatalogRepoValue', () => {
  it('accepts owner/name form', () => {
    expect(parseCatalogRepoValue('KateySt/SKILLS')).toEqual({
      owner: 'KateySt',
      name: 'SKILLS',
      fullName: 'KateySt/SKILLS',
    });
  });

  it('accepts a github.com URL form', () => {
    expect(parseCatalogRepoValue('https://github.com/KateySt/SKILLS')).toEqual({
      owner: 'KateySt',
      name: 'SKILLS',
      fullName: 'KateySt/SKILLS',
    });
  });

  it('accepts a github.com URL with a trailing .git', () => {
    expect(parseCatalogRepoValue('https://github.com/KateySt/SKILLS.git')?.fullName).toBe('KateySt/SKILLS');
  });

  it('rejects a non-github.com URL (SSRF guard)', () => {
    expect(parseCatalogRepoValue('https://evil.example.com/KateySt/SKILLS')).toBeNull();
  });

  it('rejects a bare hostname with no owner/name', () => {
    expect(parseCatalogRepoValue('not-a-repo')).toBeNull();
  });

  it('rejects an empty value', () => {
    expect(parseCatalogRepoValue('')).toBeNull();
    expect(parseCatalogRepoValue('   ')).toBeNull();
  });
});

describe('languageNameToSlug', () => {
  it('lowercases and hyphenates non-alphanumeric runs', () => {
    expect(languageNameToSlug('TypeScript')).toBe('typescript');
    expect(languageNameToSlug('C++')).toBe('c');
    expect(languageNameToSlug('Objective-C')).toBe('objective-c');
  });

  it('never aliases TypeScript and JavaScript to each other', () => {
    expect(languageNameToSlug('TypeScript')).not.toBe(languageNameToSlug('JavaScript'));
  });
});

describe('qualifyingLanguageSlugs', () => {
  it('excludes languages below the 5% byte-share threshold', () => {
    const slugs = qualifyingLanguageSlugs({ Python: 980, CSS: 20 });
    expect(slugs).toEqual(['python']);
  });

  it('includes a language exactly at the threshold', () => {
    const slugs = qualifyingLanguageSlugs({ Python: 95, CSS: 5 });
    expect(slugs.sort()).toEqual(['css', 'python']);
  });

  it('returns an empty list for a null breakdown', () => {
    expect(qualifyingLanguageSlugs(null)).toEqual([]);
  });

  it('returns an empty list for an all-zero breakdown', () => {
    expect(qualifyingLanguageSlugs({ Python: 0 })).toEqual([]);
  });
});

describe('isBodyChange', () => {
  it('is true when the patch changes body', () => {
    expect(isBodyChange({ body: 'old' }, { body: 'new' })).toBe(true);
  });

  it('is false when body is unchanged or absent from the patch', () => {
    expect(isBodyChange({ body: 'same' }, { body: 'same' })).toBe(false);
    expect(isBodyChange({ body: 'same' }, {})).toBe(false);
  });
});

describe('nameFromMarkdown', () => {
  it('derives a name from an H1 heading', () => {
    expect(nameFromMarkdown('# Secret leakage gate\n\nBody...', 'fallback')).toBe('Secret leakage gate');
  });

  it('derives a name from an H2 heading when no H1 is present', () => {
    expect(nameFromMarkdown('Some intro\n## Mock overuse\nBody...', 'fallback')).toBe('Mock overuse');
  });

  it('falls back when no heading is found', () => {
    expect(nameFromMarkdown('Just plain text, no heading.', 'fallback')).toBe('fallback');
  });
});

describe('toSkillVersionListItem', () => {
  const versionRow: SkillVersionRow = {
    skillId: 's1',
    version: 3,
    body: '# v3 body',
    createdAt: new Date('2026-05-01T00:00:00Z'),
  };

  it('maps a skill_versions row to the list item DTO', () => {
    expect(toSkillVersionListItem(versionRow, 5)).toEqual({
      version: 3,
      created_at: '2026-05-01T00:00:00.000Z',
      body: '# v3 body',
      current: false,
    });
  });

  it('marks the row current when its version matches the skill current version', () => {
    expect(toSkillVersionListItem(versionRow, 3).current).toBe(true);
  });
});

/** Minimal AgentRunRow fixture — only the fields `computeSkillStats` and
 *  `computeSkillUsageSummaries` read (agentId, findingsCount) are varied;
 *  the rest are drizzle-required but irrelevant to the math under test. */
function run(overrides: Partial<AgentRunRow>): AgentRunRow {
  return {
    id: 'run',
    workspaceId: 'ws1',
    agentId: 'ag1',
    prId: null,
    ranAt: new Date('2026-06-01T00:00:00Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    durationMs: 1000,
    tokensIn: 100,
    tokensOut: 100,
    costUsd: 0.01,
    status: 'done',
    error: null,
    source: 'local',
    findingsCount: 0,
    grounding: null,
    score: 80,
    blockers: 0,
    ...overrides,
  };
}

function finding(overrides: Partial<SkillFindingOutcomeRow>): SkillFindingOutcomeRow {
  return {
    agentId: 'ag1',
    category: 'security',
    acceptedAt: null,
    dismissedAt: null,
    reviewCreatedAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

describe('computeSkillStats', () => {
  const agents = [{ id: 'ag1', name: 'Security Reviewer' }];

  it('computes pull frequency as the share of runs with >=1 finding', () => {
    const runs = [run({ findingsCount: 2 }), run({ findingsCount: 0 }), run({ findingsCount: 1 })];
    const stats = computeSkillStats(agents, runs, []);
    expect(stats.pull_frequency).toBeCloseTo(2 / 3);
    expect(stats.used_by_agents).toBe(1);
  });

  it('computes accept rate over acted (accepted+dismissed) findings only', () => {
    const findings = [
      finding({ acceptedAt: new Date() }),
      finding({ acceptedAt: new Date() }),
      finding({ dismissedAt: new Date() }),
      finding({}), // pending — excluded from the denominator
    ];
    const stats = computeSkillStats(agents, [], findings);
    expect(stats.accept_rate).toBeCloseTo(2 / 3);
  });

  it('is null for pull_frequency/accept_rate with no runs/findings', () => {
    const stats = computeSkillStats(agents, [], []);
    expect(stats.pull_frequency).toBeNull();
    expect(stats.accept_rate).toBeNull();
  });

  it('counts findings within the 30d window and groups by category, sorted desc', () => {
    const recent = new Date();
    const stale = new Date('2020-01-01T00:00:00Z');
    const findings = [
      finding({ category: 'security', reviewCreatedAt: recent }),
      finding({ category: 'security', reviewCreatedAt: recent }),
      finding({ category: 'bug', reviewCreatedAt: recent }),
      finding({ category: 'bug', reviewCreatedAt: stale }), // outside the window
    ];
    const stats = computeSkillStats(agents, [], findings);
    expect(stats.findings_30d).toBe(3);
    expect(stats.findings_by_category).toEqual([
      { category: 'security', count: 2 },
      { category: 'bug', count: 2 },
    ]);
  });
});

describe('computeSkillUsageSummaries', () => {
  it('attributes each agent’s runs/findings to every skill it is linked to', () => {
    const links: AgentSkillLinkRow[] = [
      { skillId: 'sk1', agentId: 'ag1' },
      { skillId: 'sk2', agentId: 'ag1' }, // ag1 is shared by two skills
      { skillId: 'sk2', agentId: 'ag2' },
    ];
    const runs = [
      run({ agentId: 'ag1', findingsCount: 1 }),
      run({ agentId: 'ag1', findingsCount: 0 }),
      run({ agentId: 'ag2', findingsCount: 1 }),
    ];
    const findings = [
      finding({ agentId: 'ag1', acceptedAt: new Date() }),
      finding({ agentId: 'ag2', dismissedAt: new Date() }),
    ];

    const summaries = computeSkillUsageSummaries(['sk1', 'sk2', 'sk3'], links, runs, findings);

    expect(summaries.get('sk1')).toEqual({ used_by_agents: 1, pull_frequency: 0.5, accept_rate: 1 });
    // sk2 sums BOTH ag1 and ag2's aggregates.
    expect(summaries.get('sk2')).toEqual({ used_by_agents: 2, pull_frequency: 2 / 3, accept_rate: 0.5 });
    // sk3 has no linked agents at all.
    expect(summaries.get('sk3')).toEqual({ used_by_agents: 0, pull_frequency: null, accept_rate: null });
  });
});
