import { describe, it, expect } from 'vitest';
import {
  cloneNotification,
  countBy,
  evalSuiteNotification,
  indexNotification,
  interruptedNotification,
  onboardingNotification,
  reviewGroupNotification,
  summarizeError,
  type ReviewRunOutcome,
} from './helpers.js';

const run = (over: Partial<ReviewRunOutcome> = {}): ReviewRunOutcome => ({
  agentName: 'security-agent',
  status: 'done',
  findingsCount: 3,
  score: 72,
  error: null,
  ...over,
});
const base = { repoId: 'r1', repoName: 'acme/api', prNumber: 482 };

describe('reviewGroupNotification', () => {
  it('single agent: findings + score, links to the PR', () => {
    expect(reviewGroupNotification({ ...base, runs: [run()] })).toEqual({
      kind: 'review',
      status: 'success',
      title: 'Review done · PR #482',
      body: 'acme/api — security-agent: 3 findings, score 72',
      href: '/repos/r1/pulls/482',
    });
  });

  it('single agent failure carries the error', () => {
    expect(reviewGroupNotification({ ...base, runs: [run({ status: 'failed', error: 'rate limited' })] })).toMatchObject({
      status: 'error',
      title: 'Review failed · PR #482',
      body: 'acme/api — security-agent: rate limited',
    });
  });

  it('multi-agent: one summary, partial failures counted, links to the results page', () => {
    const n = reviewGroupNotification({
      ...base,
      multiAgentRunId: 'm1',
      runs: [run({ findingsCount: 1 }), run({ agentName: 'perf', findingsCount: 0 }), run({ status: 'failed' })],
    });
    expect(n).toEqual({
      kind: 'multi_agent',
      status: 'success',
      title: 'Multi-agent review done · PR #482',
      body: 'acme/api — 2 agents · 1 finding · 1 failed',
      href: '/multi-agent/m1',
    });
  });

  it('is silent when the user cancelled every run', () => {
    expect(reviewGroupNotification({ ...base, runs: [run({ status: 'cancelled' })] })).toBeNull();
  });

  it('every agent failed → error', () => {
    expect(
      reviewGroupNotification({ ...base, runs: [run({ status: 'failed' }), run({ status: 'failed' })] }),
    ).toMatchObject({ status: 'error', body: 'acme/api — 2 agents failed' });
  });
});

describe('other sources', () => {
  it('eval: pass rate + recall, links to the agent / skill dashboard', () => {
    const common = { ownerName: 'security-agent', isDraft: false, passed: 8, evaluated: 10, recall: 0.8234, failureReason: null };
    expect(evalSuiteNotification({ ...common, ownerKind: 'agent', ownerId: 'a1', status: 'completed' })).toEqual({
      kind: 'eval',
      status: 'success',
      title: 'Eval · security-agent done',
      body: '8/10 passed · recall 0.82',
      href: '/eval/a1',
    });
    expect(
      evalSuiteNotification({ ...common, ownerKind: 'skill', ownerId: 's1', isDraft: true, status: 'failed', failureReason: 'no key' }),
    ).toMatchObject({ status: 'error', title: 'Draft eval · security-agent failed', body: 'no key', href: '/eval/skills/s1' });
  });

  it('clone: ready vs failed', () => {
    expect(cloneNotification({ repoId: 'r1', repoName: 'acme/api' })).toMatchObject({ status: 'success', href: '/repos/r1/pulls' });
    expect(cloneNotification({ repoId: 'r1', repoName: 'acme/api', error: 'auth failed' })).toMatchObject({
      status: 'error',
      body: 'auth failed',
    });
  });

  it('index: full → success, degraded → info with the reason, failed → error', () => {
    const b = { repoId: 'r1', repoName: 'acme/api', filesIndexed: 1, reason: null };
    expect(indexNotification({ ...b, status: 'full' })).toMatchObject({ status: 'success', body: '1 file indexed' });
    expect(indexNotification({ ...b, status: 'degraded', reason: 'no_clone' })).toMatchObject({
      status: 'info',
      body: '1 file indexed — no_clone',
    });
    expect(indexNotification({ ...b, status: 'failed', reason: 'boom' })).toMatchObject({ status: 'error', body: 'boom' });
  });

  it('onboarding and interrupted', () => {
    expect(onboardingNotification({ repoId: 'r1', repoName: 'acme/api' })).toMatchObject({
      status: 'success',
      href: '/repos/r1/onboarding',
    });
    expect(interruptedNotification(1).title).toBe('1 operation interrupted');
    expect(interruptedNotification(3).title).toBe('3 operations interrupted');
  });

  it('countBy', () => {
    expect([...countBy(['w1', 'w2', 'w1'])]).toEqual([
      ['w1', 2],
      ['w2', 1],
    ]);
  });
});

describe('summarizeError', () => {
  it('keeps the fatal line of multi-line git output, without the prefix', () => {
    const raw = [
      "Cloning into 'C:\\tmp\\x'...",
      'remote: Invalid username or token.',
      "fatal: Authentication failed for 'https://github.com/a/b/'",
      '',
    ].join('\n');
    expect(summarizeError(raw)).toBe("Authentication failed for 'https://github.com/a/b/'");
  });
  it('falls back to the last non-empty line, caps length, handles empty', () => {
    expect(summarizeError('first\r\nlast line\n\n')).toBe('last line');
    expect(summarizeError('x'.repeat(500))!.length).toBe(180);
    expect(summarizeError('')).toBeNull();
    expect(summarizeError(null)).toBeNull();
  });
});
