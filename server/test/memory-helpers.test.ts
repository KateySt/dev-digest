import { describe, it, expect } from 'vitest';
import { MemoryInput } from '@devdigest/shared';
import { isStale, isValidGlob, validateMemoryInput } from '../src/modules/memory/helpers.js';
import { AppError } from '../src/platform/errors.js';

// SPEC-2026-10-12-memory AC-11 / AC-12 + staleness.
const REPO_A = '00000000-0000-4000-8000-00000000000a';
const REPO_B = '00000000-0000-4000-8000-00000000000b';
const AGENT = '00000000-0000-4000-8000-0000000000a1';
const SKILL = '00000000-0000-4000-8000-0000000000s1'.replace('s', 'e');

const input = (over: Record<string, unknown> = {}) =>
  MemoryInput.parse({
    content: 'Do not flag try/catch around JSON.parse — intentional.',
    kind: 'learning',
    scope: 'repo',
    repo_id: REPO_A,
    links: [{ target_kind: 'agent', target_id: AGENT }],
    ...over,
  });

const noSkills = { skillRepoIds: new Map<string, string | null>() };

function expectInvalid(fn: () => void, msg: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).statusCode).toBe(422);
    expect((e as Error).message).toMatch(msg);
    return;
  }
  throw new Error('expected validation to fail');
}

describe('validateMemoryInput', () => {
  it('accepts a repo memory linked to an agent', () => {
    expect(() => validateMemoryInput(input(), noSkills)).not.toThrow();
  });

  it('rejects global with repo_id', () => {
    expectInvalid(() => validateMemoryInput(input({ scope: 'global' }), noSkills), /global/i);
  });

  it('rejects repo without repo_id', () => {
    expectInvalid(() => validateMemoryInput(input({ repo_id: null }), noSkills), /repo_id/i);
  });

  it('rejects no links and not all-agents', () => {
    expectInvalid(() => validateMemoryInput(input({ links: [] }), noSkills), /link/i);
  });

  it('accepts no links when applies_to_all_agents', () => {
    expect(() => validateMemoryInput(input({ links: [], applies_to_all_agents: true }), noSkills)).not.toThrow();
  });

  it('rejects invalid glob "src/["', () => {
    expectInvalid(() => validateMemoryInput(input({ path_globs: ['src/['] }), noSkills), /glob/i);
  });

  it('rejects repo memory linked to skill of other repo', () => {
    const ctx = { skillRepoIds: new Map([[SKILL, REPO_B]]) };
    expectInvalid(
      () => validateMemoryInput(input({ links: [{ target_kind: 'skill', target_id: SKILL }] }), ctx),
      /different repo/i,
    );
  });

  it('allows repo memory linked to global skill', () => {
    const ctx = { skillRepoIds: new Map<string, string | null>([[SKILL, null]]) };
    expect(() =>
      validateMemoryInput(input({ links: [{ target_kind: 'skill', target_id: SKILL }] }), ctx),
    ).not.toThrow();
  });
});

describe('isValidGlob', () => {
  it.each(['src/**', '*.ts', 'src/*/x.ts', '**/ratelimit.ts', 'a?.ts'])('accepts %s', (g) => {
    expect(isValidGlob(g)).toBe(true);
  });
  it.each(['src/[', 'src/{a,b}', '/abs/**', '../up/**', 'a\\b', ''])('rejects %s', (g) => {
    expect(isValidGlob(g)).toBe(false);
  });
});

describe('isStale', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('true at 61 days, false at 59', () => {
    expect(isStale({ lastUsedAt: daysAgo(61), createdAt: daysAgo(100) }, now)).toBe(true);
    expect(isStale({ lastUsedAt: daysAgo(59), createdAt: daysAgo(100) }, now)).toBe(false);
  });

  it('uses created_at when never used', () => {
    expect(isStale({ lastUsedAt: null, createdAt: daysAgo(61) }, now)).toBe(true);
    expect(isStale({ lastUsedAt: null, createdAt: daysAgo(1) }, now)).toBe(false);
  });

  // SPEC-2026-10-12-memory-curation: Keep resets the stale clock.
  it('isStale is false when kept_at is recent though last_used_at is 90d old', () => {
    expect(isStale({ lastUsedAt: daysAgo(90), createdAt: daysAgo(100), keptAt: daysAgo(1) }, now)).toBe(false);
  });

  it('isStale is true when kept_at is 61d old', () => {
    expect(isStale({ lastUsedAt: daysAgo(90), createdAt: daysAgo(100), keptAt: daysAgo(61) }, now)).toBe(true);
  });
});

// ---- Task 6: Learn draft helpers ----
import { defaultDraftKind, fallbackDraft } from '../src/modules/memory/helpers.js';

describe('defaultDraftKind', () => {
  it('dismissed→learning, accepted→fact, undecided→fact', () => {
    const d = new Date();
    expect(defaultDraftKind({ acceptedAt: null, dismissedAt: d })).toBe('learning');
    expect(defaultDraftKind({ acceptedAt: d, dismissedAt: null })).toBe('fact');
    expect(defaultDraftKind({ acceptedAt: null, dismissedAt: null })).toBe('fact');
  });
});

describe('fallbackDraft', () => {
  const finding = {
    title: 'Debug flag left on',
    rationale: 'r'.repeat(1000),
    repoId: REPO_A,
    agentId: AGENT,
    acceptedAt: null,
    dismissedAt: new Date(),
  };

  it('truncates to 600 and sets fallback', () => {
    const d = fallbackDraft(finding, { agentExists: true });
    expect(d.fallback).toBe(true);
    expect(d.content.length).toBe(600);
    expect(d.content.startsWith('Debug flag left on: ')).toBe(true);
    expect(d).toMatchObject({
      kind: 'learning',
      scope: 'repo',
      repo_id: REPO_A,
      links: [{ target_kind: 'agent', target_id: AGENT }],
      applies_to_all_agents: false,
      path_globs: [],
    });
  });

  it('falls back to all agents when the producing agent is gone', () => {
    const d = fallbackDraft({ ...finding, agentId: null }, { agentExists: false });
    expect(d.links).toEqual([]);
    expect(d.applies_to_all_agents).toBe(true);
  });
});
