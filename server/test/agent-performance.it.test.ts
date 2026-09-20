import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('agent-performance (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(structured: unknown = { verdict: 'approve', summary: 'ok', score: 100, findings: [] } as Review) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: new MockLLMProvider('openai', { structured }) },
      },
    });
  }

  /** Directly seeds agent_runs + reviews + findings with KNOWN values (not via
   *  a live review run) so the assertions below check the aggregation math
   *  against numbers we chose, not numbers an LLM mock happened to produce. */
  async function seedKnownRunsAndFindings(agentId: string, repoId: string) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 999,
        title: 'perf fixture PR',
        author: 'tester',
        branch: 'x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    // Run 1: done, priced, 1000ms.
    const [run1] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId,
        prId: pr!.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'done',
        durationMs: 1000,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.02,
        findingsCount: 2,
        grounding: '2/2 passed',
        score: 80,
        blockers: 1,
      })
      .returning();
    // Run 2: done, priced, 3000ms.
    const [run2] = await pg.handle.db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        agentId,
        prId: pr!.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'done',
        durationMs: 3000,
        tokensIn: 200,
        tokensOut: 80,
        costUsd: 0.04,
        findingsCount: 1,
        grounding: '1/1 passed',
        score: 95,
        blockers: 0,
      })
      .returning();
    // Run 3: failed — no cost, but a real duration. Must still count toward
    // `runs` and `avg_latency_ms`, but NOT toward `avg_cost_usd`.
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      agentId,
      prId: pr!.id,
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'failed',
      durationMs: 500,
      tokensIn: 10,
      tokensOut: 0,
      costUsd: null,
      findingsCount: 0,
      grounding: '0/0 passed',
      error: 'boom',
    });

    // 3 findings total: 2 accepted, 1 dismissed, 0 pending — accept_rate = 2/3.
    const [review1] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId, runId: run1!.id, kind: 'review', verdict: 'request_changes' })
      .returning();
    const [review2] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId, runId: run2!.id, kind: 'review', verdict: 'comment' })
      .returning();

    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: review1!.id,
        file: 'a.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 'f1',
        rationale: 'r',
        confidence: 0.9,
        acceptedAt: new Date(),
      },
      {
        reviewId: review1!.id,
        file: 'a.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'bug',
        title: 'f2',
        rationale: 'r',
        confidence: 0.8,
        dismissedAt: new Date(),
      },
      {
        reviewId: review2!.id,
        file: 'a.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'f3',
        rationale: 'r',
        confidence: 0.7,
        acceptedAt: new Date(),
      },
    ]);

    return { pr: pr!, runIds: [run1!.id, run2!.id] };
  }

  it('GET /agents/:id/stats matches hand-computed aggregates for seeded runs/findings', async () => {
    const app = await appWith();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Perf Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'perf-repo', fullName: 'acme/perf-repo' })
      .returning();

    await seedKnownRunsAndFindings(agent.id, repo!.id);

    const stats = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/stats` })).json();
    expect(stats.runs).toBe(3);
    expect(stats.findings_total).toBe(3);
    expect(stats.accepted).toBe(2);
    expect(stats.dismissed).toBe(1);
    expect(stats.pending).toBe(0);
    expect(stats.accept_rate).toBeCloseTo(2 / 3, 10);
    expect(stats.total_cost_usd).toBeCloseTo(0.06, 10);
    expect(stats.avg_cost_usd).toBeCloseTo(0.03, 10); // over 2 priced runs, not 3
    expect(stats.avg_latency_ms).toBeCloseTo((1000 + 3000 + 500) / 3, 10);
    expect(stats.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });

    await app.close();
  });

  it('GET /agents/:id/stats 404s for an unknown agent', async () => {
    const app = await appWith();
    const res = await app.inject({ method: 'GET', url: '/agents/00000000-0000-0000-0000-000000000000/stats' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("GET /agents/:id/runs returns this agent's runs across PRs, with pr_number populated", async () => {
    const app = await appWith();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Runs Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'runs-repo', fullName: 'acme/runs-repo' })
      .returning();
    const { pr } = await seedKnownRunsAndFindings(agent.id, repo!.id);

    const runs = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/runs` })).json();
    expect(runs).toHaveLength(3);
    expect(runs.every((r: { pr_number: number }) => r.pr_number === pr.number)).toBe(true);
    // Newest first.
    expect(new Date(runs[0].ran_at).getTime()).toBeGreaterThanOrEqual(new Date(runs[1].ran_at).getTime());

    await app.close();
  });

  it('GET /agents/performance rolls up cost_by_agent and includes the seeded agent', async () => {
    const app = await appWith();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Workspace Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ws-repo', fullName: 'acme/ws-repo' })
      .returning();
    await seedKnownRunsAndFindings(agent.id, repo!.id);

    const perf = (await app.inject({ method: 'GET', url: '/agents/performance' })).json();
    const row = perf.agents.find((a: { agent_id: string }) => a.agent_id === agent.id);
    expect(row).toBeDefined();
    expect(row.runs).toBe(3);
    expect(row.total_cost_usd).toBeCloseTo(0.06, 10);
    const agentSegment = perf.cost_by_agent.find((s: { label: string }) => s.label === 'Workspace Agent');
    expect(agentSegment?.value).toBeCloseTo(0.06, 10);

    await app.close();
  });
});
