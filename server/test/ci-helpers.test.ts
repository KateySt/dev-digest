import { describe, it, expect } from 'vitest';
import { slugify } from '../src/modules/ci/helpers.js';

describe('slugify', () => {
  it('lowercases, spaces to hyphens', () => {
    expect(slugify('Security Reviewer')).toBe('security-reviewer');
  });

  it('strips non-alphanumeric characters', () => {
    expect(slugify('API Contract Reviewer!! (v2)')).toBe('api-contract-reviewer-v2');
  });

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  --Test--  ')).toBe('test');
  });

  it('falls back to "agent" for a name with no alphanumeric characters', () => {
    expect(slugify('!!!')).toBe('agent');
  });
});

// ---- SPEC-2026-10-12-memory AC-30 ----
import { buildMemoryJsonl } from '../src/modules/ci/helpers.js';

describe('buildMemoryJsonl', () => {
  it('emits one JSON object per line with a trailing newline', () => {
    const out = buildMemoryJsonl([
      { kind: 'learning', content: 'Do not flag X — because.', path_globs: ['src/**'], agent_slugs: null },
      { kind: 'fact', content: 'bucketKey() needs the version.', path_globs: [], agent_slugs: ['security'] },
    ]);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('');
    expect(JSON.parse(lines[0]!)).toEqual({
      kind: 'learning',
      content: 'Do not flag X — because.',
      path_globs: ['src/**'],
      agent_slugs: null,
    });
    expect(JSON.parse(lines[1]!).agent_slugs).toEqual(['security']);
  });

  it('empty list → empty string', () => {
    expect(buildMemoryJsonl([])).toBe('');
  });
});
