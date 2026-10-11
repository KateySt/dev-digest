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
