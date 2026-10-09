import { describe, it, expect } from 'vitest';
import {
  clampEvidenceLine,
  evidenceExistsInSource,
  normalizeForMatch,
  toConventionDto,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

const ROW: ConventionRow = {
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
  createdAt: new Date('2026-01-01T00:00:00Z'),
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
    });
  });

  it('defaults null evidence/confidence fields to empty/zero', () => {
    const dto = toConventionDto({ ...ROW, evidencePath: null, evidenceSnippet: null, confidence: null });
    expect(dto.evidence_path).toBe('');
    expect(dto.evidence_snippet).toBe('');
    expect(dto.confidence).toBe(0);
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
