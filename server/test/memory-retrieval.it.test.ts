import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { MemoryRetriever, type MemoryRunContext } from '../src/modules/memory/retrieval.js';
import { MemoryRepository } from '../src/modules/memory/repository.js';
import {
  REVIEW_ONE_HIT_ONE_DROP,
  defaultWorkspaceId,
  eq,
  insertFindingFixture,
  insertSkill,
  linkSkill,
  makeAgent,
  makeCase,
  startRun,
  waitForSuite,
  type App,
} from './helpers/eval-fixtures.js';
import { FailingEmbedder, WordEmbedder, insertRepo, makeMemoryApp, memoryBody } from './helpers/memory-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** SPEC-2026-10-12-memory AC-14..AC-21 — run-time retrieval + injection. */
d('memory retrieval (Testcontainers pg)', () => {
  let pg: PgFixture;
  let ws: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    ws = await defaultWorkspaceId(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const create = async (app: App, over: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: '/memories', payload: memoryBody(over) });
    if (res.statusCode !== 200) throw new Error(`create failed ${res.statusCode} ${res.body}`);
    return res.json() as { id: string };
  };

  const ctx = (over: Partial<MemoryRunContext>): MemoryRunContext => ({
    workspaceId: ws,
    repoId: '',
    agentId: '',
    skillIds: [],
    changedFiles: ['src/config.ts'],
    queryText: 'Add Stripe billing\nsrc/config.ts',
    model: 'gpt-4.1',
    ...over,
  });

  it('global + same-repo injected, other-repo and archived excluded', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const a = await insertRepo(pg.handle.db, ws);
    const b = await insertRepo(pg.handle.db, ws);
    const inA = await create(app, { scope: 'repo', repo_id: a.id, content: 'Repo A rule — because.' });
    const inB = await create(app, { scope: 'repo', repo_id: b.id, content: 'Repo B rule — because.' });
    const glob = await create(app, { content: 'Global rule — because.' });
    const archived = await create(app, { scope: 'repo', repo_id: a.id, content: 'Archived rule.' });
    await app.inject({ method: 'PATCH', url: `/memories/${archived.id}`, payload: { archived: true } });

    const res = await new MemoryRetriever(app.container).resolveForRun(ctx({ repoId: a.id, agentId: agent.id }));
    expect(res.ids).toContain(inA.id);
    expect(res.ids).toContain(glob.id);
    expect(res.ids).not.toContain(inB.id);
    expect(res.ids).not.toContain(archived.id);
    await app.close();
  });

  it('links: agent link, attached-skill link; other agents excluded', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const other = await makeAgent(app);
    const repo = await insertRepo(pg.handle.db, ws);
    const skill = await insertSkill(pg.handle.db, ws);
    const viaAgent = await create(app, { applies_to_all_agents: false, links: [{ target_kind: 'agent', target_id: agent.id }] });
    const viaSkill = await create(app, { applies_to_all_agents: false, links: [{ target_kind: 'skill', target_id: skill.id }] });
    const otherOnly = await create(app, { applies_to_all_agents: false, links: [{ target_kind: 'agent', target_id: other.id }] });

    const res = await new MemoryRetriever(app.container).resolveForRun(
      ctx({ repoId: repo.id, agentId: agent.id, skillIds: [skill.id] }),
    );
    expect(res.ids).toEqual(expect.arrayContaining([viaAgent.id, viaSkill.id]));
    expect(res.ids).not.toContain(otherOnly.id);
    await app.close();
  });

  it('glob-scoped memory only when a changed file matches', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const repo = await insertRepo(pg.handle.db, ws);
    const hit = await create(app, { path_globs: ['src/**'], content: 'src rule.' });
    const miss = await create(app, { path_globs: ['docs/**'], content: 'docs rule.' });
    const res = await new MemoryRetriever(app.container).resolveForRun(ctx({ repoId: repo.id, agentId: agent.id }));
    expect(res.ids).toContain(hit.id);
    expect(res.ids).not.toContain(miss.id);
    await app.close();
  });

  it('pulled entries carry kind, text and source PRs; last_used_at is set', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const { finding, repo, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id });
    const m = await create(app, { finding_id: finding.id, kind: 'fact', content: 'Pulled rule — because.' });
    const res = await new MemoryRetriever(app.container).resolveForRun(ctx({ repoId: repo.id, agentId: agent.id }));
    const pulled = res.pulled.find((p) => p.id === m.id)!;
    expect(pulled).toMatchObject({ kind: 'fact', text: 'Pulled rule — because.', source_prs: [pr.number], pr: pr.number });
    const row = (await pg.handle.db.select().from(t.memory).where(eq(t.memory.id, m.id)))[0]!;
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    await app.close();
  });

  it('ranks semantically when embeddings are on; falls back to fts when query embedding fails', async () => {
    const appOn = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const agent = await makeAgent(appOn);
    const repo = await insertRepo(pg.handle.db, ws);
    const relevant = await create(appOn, { scope: 'repo', repo_id: repo.id, content: 'stripe billing keys live in config' });
    await create(appOn, { scope: 'repo', repo_id: repo.id, content: 'unrelated note about migrations' });
    const on = await new MemoryRetriever(appOn.container).resolveForRun(
      ctx({ repoId: repo.id, agentId: agent.id, queryText: 'stripe billing config' }),
    );
    expect(on.ids[0]).toBe(relevant.id);
    await appOn.close();

    const appFail = await makeMemoryApp(pg, { embedder: new FailingEmbedder() });
    const off = await new MemoryRetriever(appFail.container).resolveForRun(
      ctx({ repoId: repo.id, agentId: agent.id, queryText: 'stripe billing config' }),
    );
    expect(off.ids[0]).toBe(relevant.id);
    expect(off.ids.length).toBeGreaterThanOrEqual(2);
    await appFail.close();
  });

  it('FIX: with embeddings on, a memory saved without an embedding is still ranked by full-text', async () => {
    const appOff = await makeMemoryApp(pg, { embedder: new FailingEmbedder() });
    const agent = await makeAgent(appOff);
    const repo = await insertRepo(pg.handle.db, ws);
    // saved during an embedding outage → null embedding
    const nullEmb = await create(appOff, { scope: 'repo', repo_id: repo.id, content: 'stripe billing keys live in config' });
    await appOff.close();
    const appOn = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const unrelated = await create(appOn, { scope: 'repo', repo_id: repo.id, content: 'something about database migrations entirely' });
    const res = await new MemoryRetriever(appOn.container).resolveForRun(
      ctx({ repoId: repo.id, agentId: agent.id, queryText: 'stripe billing config' }),
    );
    expect(res.ids.indexOf(nullEmb.id)).toBeGreaterThanOrEqual(0);
    expect(res.ids.indexOf(nullEmb.id)).toBeLessThan(res.ids.indexOf(unrelated.id));
    await appOn.close();
  });

  // ---- through a full review run ---------------------------------------------
  async function runReview(app: App, agentId: string, prId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { runIds: [runId] });
    return (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
  }

  it('review run passes memory to the prompt and lists it in the trace', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const { repo, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id });
    const m = await create(app, { scope: 'repo', repo_id: repo.id, content: 'Debug flags are config-driven here.' });
    const trace = await runReview(app, agent.id, pr.id);
    expect(trace.prompt_assembly.memory).toContain('- [learning] Debug flags are config-driven here.');
    expect(trace.prompt_assembly.memory).toContain('<team-memory>');
    expect(trace.memory_pulled.map((p: { id: string }) => p.id)).toContain(m.id);
    await app.close();
  });

  it('skips memories linked only to a disabled skill', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const { repo, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id });
    const skill = await insertSkill(pg.handle.db, ws, undefined, 'Body.', { enabled: false });
    await linkSkill(pg.handle.db, agent.id, skill.id);
    const m = await create(app, {
      scope: 'repo',
      repo_id: repo.id,
      applies_to_all_agents: false,
      links: [{ target_kind: 'skill', target_id: skill.id }],
      content: 'Only via the disabled skill.',
    });
    const trace = await runReview(app, agent.id, pr.id);
    expect(trace.memory_pulled.map((p: { id: string }) => p.id)).not.toContain(m.id);
    await app.close();
  });

  it('review succeeds when retrieval throws (AC-21)', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const { repo, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id });
    await create(app, { scope: 'repo', repo_id: repo.id });
    const orig = MemoryRepository.prototype.applicable;
    MemoryRepository.prototype.applicable = async () => {
      throw new Error('db down');
    };
    try {
      const trace = await runReview(app, agent.id, pr.id);
      expect(trace.prompt_assembly.memory ?? null).toBeNull();
      expect(trace.memory_pulled).toEqual([]);
      expect(trace.log.some((l: { msg: string }) => l.msg.includes('memory: retrieval failed'))).toBe(true);
      const run = (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id)))[0]!;
      expect(run.status).toBe('done');
    } finally {
      MemoryRepository.prototype.applicable = orig;
    }
    await app.close();
  });

  it('export: memories for any installed agent, tagged with their slugs (AC-30)', async () => {
    const app = await makeMemoryApp(pg);
    const sec = await makeAgent(app);
    const perf = await makeAgent(app);
    const outsider = await makeAgent(app);
    const repo = await insertRepo(pg.handle.db, ws);
    const other = await insertRepo(pg.handle.db, ws);
    const skill = await insertSkill(pg.handle.db, ws);
    const all = await create(app, { content: 'For everyone.', path_globs: ['src/**'] });
    const secOnly = await create(app, { applies_to_all_agents: false, links: [{ target_kind: 'agent', target_id: sec.id }], content: 'Sec only.' });
    const viaSkill = await create(app, { applies_to_all_agents: false, links: [{ target_kind: 'skill', target_id: skill.id }], content: 'Via skill.' });
    const outsiderOnly = await create(app, { applies_to_all_agents: false, links: [{ target_kind: 'agent', target_id: outsider.id }], content: 'Outsider.' });
    const otherRepo = await create(app, { scope: 'repo', repo_id: other.id, content: 'Other repo.' });

    const items = await new MemoryRetriever(app.container).resolveForExport(ws, repo.id, [
      { slug: 'security', agentId: sec.id, skillIds: [] },
      { slug: 'performance', agentId: perf.id, skillIds: [skill.id] },
    ]);
    const byContent = new Map(items.map((i) => [i.content, i]));
    expect(byContent.get('For everyone.')).toEqual({ kind: 'learning', content: 'For everyone.', path_globs: ['src/**'], agent_slugs: null });
    expect(byContent.get('Sec only.')!.agent_slugs).toEqual(['security']);
    expect(byContent.get('Via skill.')!.agent_slugs).toEqual(['performance']);
    expect(byContent.has('Outsider.')).toBe(false);
    expect(byContent.has('Other repo.')).toBe(false);
    void all; void secOnly; void viaSkill; void outsiderOnly; void otherRepo;
    await app.close();
  });

  it('eval run assembly has no memory section (AC-20)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_ONE_HIT_ONE_DROP });
    const app = await makeMemoryApp(pg, { llm });
    const agent = await makeAgent(app);
    await create(app, { content: 'Global memory that must never reach evals.' });
    await makeCase(app, agent.id);
    const run = (await startRun(app, agent.id)).json();
    const done = await waitForSuite(app, run.run_id);
    expect(done.status).toBe('completed');
    const prompts = llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => JSON.stringify((c.req as { messages: unknown }).messages));
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.some((p) => p.includes('team-memory') || p.includes('must never reach evals'))).toBe(false);
    await app.close();
  });
});
