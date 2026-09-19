import { describe, it, expect } from 'vitest';
import { toSkillDto, isBodyChange, nameFromMarkdown } from '../src/modules/skills/helpers.js';
import type { SkillRow } from '../src/db/rows.js';

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
    });
  });

  it('passes through evidence_files when present', () => {
    const dto = toSkillDto({ ...ROW, evidenceFiles: ['src/a.ts:12'] });
    expect(dto.evidence_files).toEqual(['src/a.ts:12']);
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
