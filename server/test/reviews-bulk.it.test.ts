/* B10 — bulk review isolation + race safety (SPEC-05 S-AC-3, 4, 8, 9, 21..24).
   Integration-only: the guarantees under test live in Postgres (a per-PR
   advisory lock inside one transaction), so a mocked repository would prove
   nothing. The LLM is gated so started runs stay `running` while a second,
   concurrent request arrives. */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';
import type { BulkReviewOutcome, Review, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

/** Structured completions block until `release()` so runs stay `running`. */
class GatedLLM extends MockLLMProvider {
  private gate: Promise<void>;
  release!: () => void;
  constructor() {
    super('openai', { structured: REVIEW_FIXTURE });
    this.gate = new Promise<void>((resolve) => (this.release = resolve));
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    await this.gate;
    return super.completeStructured(req);
  }
}

/** Background runs are slow on this stack (several seconds each); give the wait headroom. */
const WAIT = { timeoutMs: 90_000 };

let repoSeq = 0;
let prNumber = 1000;

d('B10 bulk review isolation + race safety (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  const agentIds: string[] = [];
  const closers: Array<() => Promise<unknown>> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    // Exactly two enabled agents (both on the mocked provider) so run counts are exact.
    await pg.handle.db.update(t.agents).set({ enabled: false });
    const app = await makeApp(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    for (const name of ['Bulk A', 'Bulk B']) {
      const res = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'review' },
      });
      agentIds.push(res.json().id);
    }
    await app.close();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    while (closers.length) await closers.pop()!();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(llm: MockLLMProvider) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
      },
    });
  }

  /** A fresh repo with `n` needs_review PRs. */
  async function seedRepo(n: number) {
    const db = pg.handle.db;
    const name = `bulk-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const prs: { id: string }[] = [];
    for (let i = 0; i < n; i++) {
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number: prNumber++,
          title: `PR ${i}`,
          author: 'marisa.koch',
          branch: `feat/${i}`,
          base: 'main',
          headSha: `sha${i}`,
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'open',
          body: 'body',
        })
        .returning();
      await db.insert(t.prFiles).values({
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
      });
      prs.push({ id: pr!.id });
    }
    return { repo: repo!, prs };
  }

  const runsFor = (prId: string) =>
    pg.handle.db.select().from(t.agentRuns).where(and(eq(t.agentRuns.prId, prId), inArray(t.agentRuns.agentId, agentIds)));

  async function bulk(app: Awaited<ReturnType<typeof makeApp>>, repoId: string) {
    return app.inject({ method: 'POST', url: `/repos/${repoId}/pulls/review` });
  }

  it('B10 / S-AC-8, S-AC-22: a start failure on one PR marks that PR failed, leaves nothing running, and the others still start', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(llm);
    closers.push(() => app.close());
    const { repo, prs } = await seedRepo(3);
    const victim = prs[1]!.id;

    const original = ReviewRepository.prototype.createRunsIfIdle;
    vi.spyOn(ReviewRepository.prototype, 'createRunsIfIdle').mockImplementation(function (this: ReviewRepository, ws, prId, agents) {
      if (prId === victim) return Promise.reject(new Error('injected start failure'));
      return original.call(this, ws, prId, agents);
    });

    const res = await bulk(app, repo.id);
    expect(res.statusCode).toBe(200);
    const results: BulkReviewOutcome[] = res.json().results;
    const byPr = new Map(results.map((r) => [r.pr_id, r]));
    expect(results).toHaveLength(3);
    expect(byPr.get(victim)).toMatchObject({ outcome: 'failed', run_ids: [] });
    expect(byPr.get(victim)!.reason).toContain('injected start failure');
    for (const pr of prs.filter((p) => p.id !== victim)) {
      const outcome = byPr.get(pr.id)!;
      expect(outcome.outcome).toBe('started');
      expect(outcome.run_ids).toHaveLength(agentIds.length);
    }

    // The failed PR has no queued/running rows at all; the others run to completion (S-AC-8).
    expect(await runsFor(victim)).toHaveLength(0);
    for (const pr of prs.filter((p) => p.id !== victim)) {
      const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: agentIds.length, ...WAIT });
      expect(runs.filter((r) => r.status === 'done')).toHaveLength(agentIds.length);
    }
  });

  it('B10 / S-AC-22: a run-row insert that fails part-way rolls the whole PR back (no partial rows left running)', async () => {
    const { prs } = await seedRepo(1);
    const repo = new ReviewRepository(pg.handle.db);
    // The second "agent" violates the agent FK, AFTER the first row's values were queued.
    await expect(
      repo.createRunsIfIdle(workspaceId, prs[0]!.id, [
        { id: agentIds[0]!, provider: 'openai', model: 'gpt-4.1' },
        { id: randomUUID(), provider: 'openai', model: 'gpt-4.1' },
      ]),
    ).rejects.toThrow();
    expect(await runsFor(prs[0]!.id)).toHaveLength(0);

    // failRunningRuns (the defensive path for rows that did commit) only touches queued/running rows.
    const ids = await repo.createRunsIfIdle(workspaceId, prs[0]!.id, [{ id: agentIds[0]!, provider: 'openai', model: 'gpt-4.1' }]);
    expect(ids).toHaveLength(1);
    await repo.failRunningRuns(ids!, 'boom');
    const [row] = await runsFor(prs[0]!.id);
    expect(row).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('B10 / S-AC-4, S-AC-9: a PR with a run in flight is skipped, and the response does not wait for any review', async () => {
    const llm = new GatedLLM();
    const app = await makeApp(llm);
    closers.push(async () => {
      llm.release();
      await app.close();
    });
    const { repo, prs } = await seedRepo(2);

    const first = await bulk(app, repo.id); // returns while every LLM call is still gated (S-AC-9)
    expect(first.statusCode).toBe(200);
    expect((first.json().results as BulkReviewOutcome[]).map((r) => r.outcome)).toEqual(['started', 'started']);

    const second = await bulk(app, repo.id);
    const results: BulkReviewOutcome[] = second.json().results;
    expect(results.map((r) => r.outcome)).toEqual(['skipped', 'skipped']);
    for (const pr of prs) expect(await runsFor(pr.id)).toHaveLength(agentIds.length);

    llm.release();
    for (const pr of prs) await waitForPrRuns(pg.handle.db, pr.id, { expected: agentIds.length, ...WAIT });
  });

  it('B10 / S-AC-21: two concurrent bulk requests create exactly one set of runs per PR; the loser reports skipped', async () => {
    const llm = new GatedLLM();
    const app = await makeApp(llm);
    closers.push(async () => {
      llm.release();
      await app.close();
    });
    const { repo, prs } = await seedRepo(4);

    const [a, b] = await Promise.all([bulk(app, repo.id), bulk(app, repo.id)]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const ra = new Map((a.json().results as BulkReviewOutcome[]).map((r) => [r.pr_id, r.outcome]));
    const rb = new Map((b.json().results as BulkReviewOutcome[]).map((r) => [r.pr_id, r.outcome]));

    for (const pr of prs) {
      expect([ra.get(pr.id), rb.get(pr.id)].sort()).toEqual(['skipped', 'started']);
      const runs = await runsFor(pr.id);
      expect(runs).toHaveLength(agentIds.length);
      // in flight: running (took a queue slot) or queued (waiting for one)
      expect(runs.every((r) => r.status === 'running' || r.status === 'queued')).toBe(true);
    }

    llm.release();
    for (const pr of prs) await waitForPrRuns(pg.handle.db, pr.id, { expected: agentIds.length, ...WAIT });
  });

  it('B10 / S-AC-23, S-AC-24: concurrent single-PR triggers - exactly one is accepted, the other gets 409 review_in_progress; a later trigger (any agent) also gets 409 and creates nothing', async () => {
    const llm = new GatedLLM();
    const app = await makeApp(llm);
    closers.push(async () => {
      llm.release();
      await app.close();
    });
    const { prs } = await seedRepo(1);
    const prId = prs[0]!.id;
    const trigger = (agentId: string) =>
      app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });

    const [x, y] = await Promise.all([trigger(agentIds[0]!), trigger(agentIds[0]!)]);
    const codes = [x.statusCode, y.statusCode].sort();
    expect(codes).toEqual([200, 409]); // 200 = the endpoint's existing accepted status (see report)
    const loser = x.statusCode === 409 ? x : y;
    expect(loser.json().error.code).toBe('review_in_progress');
    expect(await runsFor(prId)).toHaveLength(1);

    // S-AC-23: the check is "any run for this PR", not "a run for this agent".
    const other = await trigger(agentIds[1]!);
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('review_in_progress');
    expect(await runsFor(prId)).toHaveLength(1);

    llm.release();
    await waitForPrRuns(pg.handle.db, prId, { expected: 1, ...WAIT });

    // Once the run has finished the PR is idle again.
    const again = await trigger(agentIds[1]!);
    expect(again.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, prId, { expected: 2, ...WAIT });
  });
});
