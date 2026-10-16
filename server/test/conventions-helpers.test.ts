import { describe, it, expect } from 'vitest';
import {
  clampEvidenceLine,
  evidenceExistsInSource,
  normalizeForMatch,
  toConventionDto,
  unavailableIds,
} from '../src/modules/conventions/helpers.js';
import type { ConventionWithSkill } from '../src/modules/conventions/repository.js';

const ROW: ConventionWithSkill = {
  id: 'c1',
  workspaceId: 'ws1',
  repoId: 'r1',
  category: 'errors',
  rule: 'Always use async/await instead of .then() chains',
  rationale: 'Chained .then() hides error propagation.',
  evidencePath: 'src/api/users.ts',
  evidenceSnippet: 'const user = await db.users.find(id);',
  evidenceLine: 23,
  confidence: 0.91,
  status: 'pending',
  skillId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  skill: null,
};

describe('toConventionDto', () => {
  it('maps a convention row to the public DTO', () => {
    expect(toConventionDto(ROW)).toEqual({
      id: 'c1',
      category: 'errors',
      rule: 'Always use async/await instead of .then() chains',
      rationale: 'Chained .then() hides error propagation.',
      evidence_path: 'src/api/users.ts',
      evidence_snippet: 'const user = await db.users.find(id);',
      evidence_line: 23,
      confidence: 0.91,
      status: 'pending',
      skill: null,
    });
  });

  it('maps the linked skill (SPEC-2026-10-16-convention-skills AC-1)', () => {
    const dto = toConventionDto({
      ...ROW,
      status: 'accepted',
      skillId: 's1',
      skill: { id: 's1', name: 'API errors', repoId: null },
    });
    expect(dto.skill).toEqual({ id: 's1', name: 'API errors', repo_id: null });
  });

  it('defaults null evidence/confidence fields to empty/zero', () => {
    const dto = toConventionDto({ ...ROW, evidencePath: null, evidenceSnippet: null, confidence: null });
    expect(dto.evidence_path).toBe('');
    expect(dto.evidence_snippet).toBe('');
    expect(dto.confidence).toBe(0);
  });
});

describe('unavailableIds', () => {
  const row = (id: string, over: Partial<ConventionWithSkill> = {}) => ({ ...ROW, id, status: 'accepted' as const, ...over });

  it('accepts accepted, unlinked rows of the repo', () => {
    expect(unavailableIds([row('a'), row('b')], ['a', 'b'], 'r1')).toEqual({ missing: [], unavailable: [] });
  });

  it('reports unknown ids and other-repo rows as missing', () => {
    expect(unavailableIds([row('a'), row('b', { repoId: 'r2' })], ['a', 'b', 'zz'], 'r1')).toEqual({
      missing: ['b', 'zz'],
      unavailable: [],
    });
  });

  it('reports pending, rejected and already linked rows as unavailable', () => {
    const rows = [row('p', { status: 'pending' }), row('x', { status: 'rejected' }), row('l', { skillId: 's1' })];
    expect(unavailableIds(rows, ['p', 'x', 'l'], 'r1')).toEqual({ missing: [], unavailable: ['p', 'x', 'l'] });
  });
});

describe('normalizeForMatch', () => {
  it('collapses runs of whitespace and trims', () => {
    expect(normalizeForMatch('  const   x =\n  1;  ')).toBe('const x = 1;');
  });
});

describe('evidenceExistsInSource', () => {
  const source = `import { db } from './db';\n\nexport async function getUser(id: string) {\n  const user = await db.users.find(id);\n  return user;\n}\n`;

  it('is true when the snippet appears verbatim in the source', () => {
    expect(evidenceExistsInSource(source, 'const user = await db.users.find(id);')).toBe(true);
  });

  it('is true when only whitespace/indentation differs', () => {
    expect(evidenceExistsInSource(source, '  const   user   =   await db.users.find(id);  ')).toBe(true);
  });

  it('is false when the snippet does not appear in the source (hallucinated evidence)', () => {
    expect(evidenceExistsInSource(source, 'const user = await db.users.findOrThrow(id);')).toBe(false);
  });

  it('is false for an empty snippet', () => {
    expect(evidenceExistsInSource(source, '   ')).toBe(false);
  });
});

describe('clampEvidenceLine', () => {
  const source = 'line1\nline2\nline3';

  it('keeps a line number within range', () => {
    expect(clampEvidenceLine(source, 2)).toBe(2);
  });

  it('drops a line number past the end of the file', () => {
    expect(clampEvidenceLine(source, 99)).toBeNull();
  });

  it('drops a non-positive line number', () => {
    expect(clampEvidenceLine(source, 0)).toBeNull();
  });

  it('passes through null/undefined as null', () => {
    expect(clampEvidenceLine(source, null)).toBeNull();
    expect(clampEvidenceLine(source, undefined)).toBeNull();
  });
});
