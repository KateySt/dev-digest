import { describe, it, expect } from 'vitest';
import type { SkillScanFinding } from '@devdigest/shared';
import { hasBlockingFindings, isScanBlocking } from './helpers.js';

/**
 * The content-scan gate is the mechanism behind the whole feature: it's what
 * `SkillsService.update`/`create` use to decide whether a skill can be
 * enabled, and what `eval`/`ci`/`run-executor` use to decide whether an
 * enabled skill's body actually reaches a reviewing agent's prompt. Both
 * call sites must agree on "blocking" — this pins that single definition.
 */

function finding(overrides: Partial<SkillScanFinding> = {}): SkillScanFinding {
  return {
    severity: 'low',
    category: 'obfuscation',
    excerpt: 'excerpt',
    location: 'skill body',
    explanation: 'explanation',
    ...overrides,
  };
}

describe('hasBlockingFindings', () => {
  it('is false for no findings', () => {
    expect(hasBlockingFindings(null)).toBe(false);
    expect(hasBlockingFindings(undefined)).toBe(false);
    expect(hasBlockingFindings([])).toBe(false);
  });

  it('is false when every finding is medium/low', () => {
    expect(hasBlockingFindings([finding({ severity: 'medium' }), finding({ severity: 'low' })])).toBe(false);
  });

  it('is true when at least one finding is critical or high', () => {
    expect(hasBlockingFindings([finding({ severity: 'low' }), finding({ severity: 'critical' })])).toBe(true);
    expect(hasBlockingFindings([finding({ severity: 'high' })])).toBe(true);
  });
});

describe('isScanBlocking', () => {
  it('fails closed for a skill never scanned or whose scan errored', () => {
    expect(isScanBlocking('pending')).toBe(true);
    expect(isScanBlocking('error')).toBe(true);
    // Even a (nonsensical) clean-looking findings list doesn't rescue these —
    // the STATUS itself is the fail-closed signal, not the findings array.
    expect(isScanBlocking('pending', [])).toBe(true);
    expect(isScanBlocking('error', [])).toBe(true);
  });

  it('passes a clean scan regardless of findings', () => {
    expect(isScanBlocking('clean')).toBe(false);
    expect(isScanBlocking('clean', [finding({ severity: 'critical' })])).toBe(false);
  });

  it('blocks a flagged scan only when a finding is critical/high', () => {
    expect(isScanBlocking('flagged', [finding({ severity: 'low' })])).toBe(false);
    expect(isScanBlocking('flagged', [finding({ severity: 'medium' })])).toBe(false);
    expect(isScanBlocking('flagged', [finding({ severity: 'high' })])).toBe(true);
    expect(isScanBlocking('flagged', [finding({ severity: 'critical' })])).toBe(true);
  });

  it('treats a flagged status with no findings as non-blocking (defensive, should not happen in practice)', () => {
    expect(isScanBlocking('flagged', [])).toBe(false);
  });
});
