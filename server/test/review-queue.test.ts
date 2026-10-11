import { describe, it, expect } from 'vitest';
import { ReviewQueue, parseReviewConcurrency } from '../src/platform/review-queue.js';
import { loadConfig } from '../src/platform/config.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  return { promise, resolve };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('parseReviewConcurrency / config', () => {
  it('defaults to 3 when unset or empty', () => {
    expect(parseReviewConcurrency(undefined)).toEqual({ value: 3, invalid: false });
    expect(parseReviewConcurrency('')).toEqual({ value: 3, invalid: false });
  });
  it('accepts positive integers', () => {
    expect(parseReviewConcurrency('5')).toEqual({ value: 5, invalid: false });
  });
  it.each(['0', '-1', 'abc', '1.5', '2x'])('falls back to 3 and flags %s', (raw) => {
    expect(parseReviewConcurrency(raw)).toEqual({ value: 3, invalid: true });
  });
  it('loadConfig exposes the values and the warn flag', () => {
    const c = loadConfig({ REVIEW_CONCURRENCY: 'nope' } as NodeJS.ProcessEnv);
    expect(c.reviewConcurrency).toBe(3);
    expect(c.reviewConcurrencyInvalid).toBe(true);
  });
  it('warns through the logger once attached', () => {
    const warns: string[] = [];
    const q = new ReviewQueue(3, { invalidConfig: true, rawConfig: 'x' });
    q.setLogger({ info() {}, error() {}, warn: (_o, m) => void warns.push(m) });
    expect(warns).toHaveLength(1);
  });
});

describe('ReviewQueue', () => {
  it('never exceeds the limit and starts FIFO', async () => {
    const q = new ReviewQueue(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: string[] = [];
    let running = 0;
    let max = 0;
    const done = gates.map((g, i) =>
      q.enqueue({
        runId: `r${i}`,
        groupKey: 'g',
        run: async () => {
          started.push(`r${i}`);
          max = Math.max(max, ++running);
          await g.promise;
          running--;
        },
      }),
    );
    await tick();
    expect(started).toEqual(['r0', 'r1']);
    expect(q.position('r2')).toBe(1);
    expect(q.position('r3')).toBe(2);
    expect(q.position('r0')).toBeNull();
    gates[0]!.resolve();
    await tick();
    expect(started).toEqual(['r0', 'r1', 'r2']);
    expect(q.position('r3')).toBe(1);
    gates.forEach((g) => g.resolve());
    await Promise.all(done);
    expect(max).toBe(2);
  });

  it('calls onStart before run', async () => {
    const q = new ReviewQueue(1);
    const order: string[] = [];
    await q.enqueue({
      runId: 'a',
      groupKey: 'g',
      onStart: () => void order.push('start'),
      run: async () => void order.push('run'),
    });
    expect(order).toEqual(['start', 'run']);
  });

  it('remove drops a queued job (never runs) but not a running one', async () => {
    const q = new ReviewQueue(1);
    const gate = deferred();
    let ranB = false;
    const a = q.enqueue({ runId: 'a', groupKey: 'g', run: () => gate.promise });
    const b = q.enqueue({ runId: 'b', groupKey: 'g', run: async () => void (ranB = true) });
    await tick();
    expect(q.remove('a')).toBe(false);
    expect(q.remove('b')).toBe(true);
    expect(await b).toEqual({ status: 'removed' });
    gate.resolve();
    await a;
    await tick();
    expect(ranB).toBe(false);
    expect(q.position('b')).toBeNull();
  });

  it('a rejecting job (or onStart) frees its slot', async () => {
    const q = new ReviewQueue(1);
    const bad = q.enqueue({ runId: 'a', groupKey: 'g', run: () => Promise.reject(new Error('boom')) });
    const badStart = q.enqueue({
      runId: 'b',
      groupKey: 'g',
      onStart: () => Promise.reject(new Error('x')),
      run: async () => {},
    });
    let ok = false;
    const good = q.enqueue({ runId: 'c', groupKey: 'g', run: async () => void (ok = true) });
    expect((await bad).status).toBe('failed');
    expect((await badStart).status).toBe('failed');
    expect((await good).status).toBe('completed');
    expect(ok).toBe(true);
  });
});
