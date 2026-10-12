import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MemoryRepository } from '../src/modules/memory/repository.js';
import { defaultWorkspaceId, eq, insertFindingFixture, insertSkill, makeAgent } from './helpers/eval-fixtures.js';
import {
  FailingEmbedder,
  WordEmbedder,
  insertRepo,
  makeMemoryApp,
  memoryBody,
} from './helpers/memory-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** SPEC-2026-10-12-memory — memory CRUD, validation, duplicate check, merge (Tasks 4–5). */
d('memory routes (Testcontainers pg)', () => {
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

  const memRow = async (id: string) =>
    (await pg.handle.db.select().from(t.memory).where(eq(t.memory.id, id)))[0];

  it('create → list → get round-trip', async () => {
    const app = await makeMemoryApp(pg);
    const repo = await insertRepo(pg.handle.db, ws);
    const agent = await makeAgent(app);
    const created = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: memoryBody({
        scope: 'repo',
        repo_id: repo.id,
        applies_to_all_agents: false,
        links: [{ target_kind: 'agent', target_id: agent.id }],
        path_globs: ['src/**'],
      }),
    });
    expect(created.statusCode).toBe(200);
    const m = created.json();
    expect(m).toMatchObject({
      scope: 'repo',
      repo_id: repo.id,
      path_globs: ['src/**'],
      unlinked: false,
      stale: false,
      last_used_at: null,
      archived_at: null,
    });
    expect(m.links).toEqual([{ target_kind: 'agent', target_id: agent.id, name: agent.name }]);
    expect(m.sources[0]).toMatchObject({ context: 'manual' });

    const list = (await app.inject({ method: 'GET', url: `/memories?repo_id=${repo.id}` })).json();
    expect(list.items.map((i: { id: string }) => i.id)).toContain(m.id);
    expect(list.search_mode).toBe('text');
    expect(list.counts.kind.learning).toBeGreaterThanOrEqual(1);

    const got = await app.inject({ method: 'GET', url: `/memories/${m.id}` });
    expect(got.json().id).toBe(m.id);
    await app.close();
  });

  it('list for a repo includes global memories but not other repos', async () => {
    const app = await makeMemoryApp(pg);
    const a = await insertRepo(pg.handle.db, ws);
    const b = await insertRepo(pg.handle.db, ws);
    const inA = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ scope: 'repo', repo_id: a.id }) })).json();
    const inB = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ scope: 'repo', repo_id: b.id }) })).json();
    const glob = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() })).json();
    const ids = (await app.inject({ method: 'GET', url: `/memories?repo_id=${a.id}` })).json().items.map((i: { id: string }) => i.id);
    expect(ids).toContain(inA.id);
    expect(ids).toContain(glob.id);
    expect(ids).not.toContain(inB.id);
    await app.close();
  });

  it('PATCH archived hides from default list, shows with archived=true', async () => {
    const app = await makeMemoryApp(pg);
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() })).json();
    const patched = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { archived: true } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().archived_at).not.toBeNull();
    const def = (await app.inject({ method: 'GET', url: '/memories' })).json().items.map((i: { id: string }) => i.id);
    expect(def).not.toContain(m.id);
    const arch = (await app.inject({ method: 'GET', url: '/memories?archived=true' })).json().items.map((i: { id: string }) => i.id);
    expect(arch).toContain(m.id);
    await app.close();
  });

  it('PATCH edits content and keeps cross-field validation', async () => {
    const app = await makeMemoryApp(pg);
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() })).json();
    const ok = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { content: 'Edited rule — why.' } });
    expect(ok.json().content).toBe('Edited rule — why.');
    const bad = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { applies_to_all_agents: false } });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('DELETE removes', async () => {
    const app = await makeMemoryApp(pg);
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() })).json();
    expect((await app.inject({ method: 'DELETE', url: `/memories/${m.id}` })).statusCode).toBe(204);
    expect(await memRow(m.id)).toBeUndefined();
    expect((await app.inject({ method: 'GET', url: `/memories/${m.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('validation: team scope, oversize content, missing repo_id → 422', async () => {
    const app = await makeMemoryApp(pg);
    const post = (payload: object) => app.inject({ method: 'POST', url: '/memories', payload });
    expect((await post(memoryBody({ scope: 'team' }))).statusCode).toBe(422);
    expect((await post(memoryBody({ content: 'x'.repeat(601) }))).statusCode).toBe(422);
    expect((await post(memoryBody({ scope: 'repo', repo_id: null }))).statusCode).toBe(422);
    expect((await post(memoryBody({ applies_to_all_agents: false }))).statusCode).toBe(422);
    await app.close();
  });

  it('rejects a link to an agent from another workspace / unknown id → 422', async () => {
    const app = await makeMemoryApp(pg);
    const res = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: memoryBody({
        applies_to_all_agents: false,
        links: [{ target_kind: 'agent', target_id: '00000000-0000-4000-8000-000000000999' }],
      }),
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('rejects repo memory linked to a skill of another repo (AC-12)', async () => {
    const app = await makeMemoryApp(pg);
    const a = await insertRepo(pg.handle.db, ws);
    const b = await insertRepo(pg.handle.db, ws);
    const skill = await insertSkill(pg.handle.db, ws);
    await pg.handle.db.update(t.skills).set({ repoId: b.id }).where(eq(t.skills.id, skill.id));
    const res = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: memoryBody({
        scope: 'repo',
        repo_id: a.id,
        applies_to_all_agents: false,
        links: [{ target_kind: 'skill', target_id: skill.id }],
      }),
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('agent delete leaves memory unlinked (AC-13)', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const m = (
      await app.inject({
        method: 'POST',
        url: '/memories',
        payload: memoryBody({ applies_to_all_agents: false, links: [{ target_kind: 'agent', target_id: agent.id }] }),
      })
    ).json();
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent.id));
    const got = (await app.inject({ method: 'GET', url: `/memories/${m.id}` })).json();
    expect(got.unlinked).toBe(true);
    expect(got.links).toEqual([]);
    expect(await memRow(m.id)).toBeDefined();
    await app.close();
  });

  it('similar returns ≤3 above threshold (fts path, embeddings disabled)', async () => {
    const app = await makeMemoryApp(pg);
    const repo = await insertRepo(pg.handle.db, ws);
    const near = (
      await app.inject({
        method: 'POST',
        url: '/memories',
        payload: memoryBody({ scope: 'repo', repo_id: repo.id, content: 'bucketKey() must include the API version prefix or v1/v2 clients collide.' }),
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: '/memories',
      payload: memoryBody({ scope: 'repo', repo_id: repo.id, content: 'DB migrations always ship in their own PR.' }),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/memories/similar?repo_id=${repo.id}&content=${encodeURIComponent('bucketKey needs the API version prefix so clients do not collide')}`,
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().map((s: { id: string }) => s.id);
    expect(ids).toContain(near.id);
    expect(ids.length).toBeLessThanOrEqual(3);
    expect(res.json().every((s: { content: string }) => !s.content.startsWith('DB migrations'))).toBe(true);
    await app.close();
  });

  it('merge appends source, replaces content, confidence = max, no new row (AC-10)', async () => {
    const app = await makeMemoryApp(pg);
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ confidence: 0.6 }) })).json();
    const before = (await pg.handle.db.select().from(t.memory)).length;
    const { finding, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: null, decision: 'dismissed' });
    const res = await app.inject({
      method: 'POST',
      url: `/memories/${m.id}/merge`,
      payload: { content: 'Merged rule — because.', confidence: 0.9, finding_id: finding.id },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: m.id, content: 'Merged rule — because.', confidence: 0.9 });
    expect(res.json().sources).toHaveLength(2);
    expect(res.json().sources[1]).toMatchObject({ pr: pr.number, finding_id: finding.id });
    expect((await pg.handle.db.select().from(t.memory)).length).toBe(before);
    const f = (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, finding.id)))[0]!;
    expect(f.memoryId).toBe(m.id);
    await app.close();
  });

  it('create with finding_id sets findings.memory_id; second create for same finding → 409', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const { finding, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id });
    const first = await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ finding_id: finding.id }) });
    expect(first.statusCode).toBe(200);
    expect(first.json().sources[0]).toMatchObject({ pr: pr.number, finding_id: finding.id, agent_id: agent.id });
    const f = (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, finding.id)))[0]!;
    expect(f.memoryId).toBe(first.json().id);
    const second = await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ finding_id: finding.id }) });
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  it('list q uses text mode when embeddings disabled', async () => {
    const app = await makeMemoryApp(pg);
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'Redis connections are reused through the shared pool.' }) })).json();
    const res = (await app.inject({ method: 'GET', url: `/memories?q=${encodeURIComponent('redis connection reuse')}` })).json();
    expect(res.search_mode).toBe('text');
    expect(res.items[0].id).toBe(m.id);
    await app.close();
  });

  it('FIX: archiving an unlinked memory succeeds (agent deleted)', async () => {
    const app = await makeMemoryApp(pg);
    const agent = await makeAgent(app);
    const m = (
      await app.inject({
        method: 'POST',
        url: '/memories',
        payload: memoryBody({ applies_to_all_agents: false, links: [{ target_kind: 'agent', target_id: agent.id }] }),
      })
    ).json();
    await pg.handle.db.delete(t.agents).where(eq(t.agents.id, agent.id));
    const res = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { archived: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().archived_at).not.toBeNull();
    const back = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { archived: false } });
    expect(back.statusCode).toBe(200);
    await app.close();
  });

  it('FIX: claimFinding only claims an unlearned finding (idempotent Save)', async () => {
    const app = await makeMemoryApp(pg);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    const a = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'A.' }) })).json();
    const b = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'B.' }) })).json();
    const repo = new MemoryRepository(pg.handle.db);
    expect(await repo.claimFinding(finding.id, a.id)).toBe(true);
    expect(await repo.claimFinding(finding.id, b.id)).toBe(false);
    const f = (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, finding.id)))[0]!;
    expect(f.memoryId).toBe(a.id);
    await app.close();
  });

  // ---- Task 5: embeddings on write -------------------------------------------
  it('stores embedding when embedder injected', async () => {
    const app = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() })).json();
    expect((await memRow(m.id))!.embedding).not.toBeNull();
    await app.close();
  });

  it('saves with null embedding when embed throws', async () => {
    const app = await makeMemoryApp(pg, { embedder: new FailingEmbedder() });
    const res = await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() });
    expect(res.statusCode).toBe(200);
    expect((await memRow(res.json().id))!.embedding).toBeNull();
    await app.close();
  });

  it('similar uses cosine path when embeddings on; list reports semantic mode', async () => {
    const app = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const repo = await insertRepo(pg.handle.db, ws);
    const near = (
      await app.inject({
        method: 'POST',
        url: '/memories',
        payload: memoryBody({ scope: 'repo', repo_id: repo.id, content: 'stripe webhooks are verified with the stripe signature header' }),
      })
    ).json();
    const res = await app.inject({
      method: 'GET',
      url: `/memories/similar?repo_id=${repo.id}&content=${encodeURIComponent('stripe webhooks are verified with the stripe signature header here')}`,
    });
    const hit = res.json().find((s: { id: string }) => s.id === near.id);
    expect(hit.similarity).toBeGreaterThanOrEqual(0.88);
    const list = (await app.inject({ method: 'GET', url: `/memories?q=stripe` })).json();
    expect(list.search_mode).toBe('semantic');
    await app.close();
  });

  it('FIX: semantic search narrows the list (unrelated memories are not returned)', async () => {
    const app = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const repo = await insertRepo(pg.handle.db, ws);
    const hit = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ scope: 'repo', repo_id: repo.id, content: 'redis connections are reused through one pool' }) })).json();
    const miss = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ scope: 'repo', repo_id: repo.id, content: 'migrations ship alone' }) })).json();
    const ids = (await app.inject({ method: 'GET', url: `/memories?repo_id=${repo.id}&q=${encodeURIComponent('redis connection pool reuse')}` }))
      .json()
      .items.map((i: { id: string }) => i.id);
    expect(ids).toContain(hit.id);
    expect(ids).not.toContain(miss.id);
    await app.close();
  });

  it('content edit re-embeds', async () => {
    const emb = new WordEmbedder();
    const app = await makeMemoryApp(pg, { embedder: emb });
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody() })).json();
    const calls = emb.calls;
    await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { content: 'Brand new wording.' } });
    expect(emb.calls).toBe(calls + 1);
    await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { kind: 'fact' } });
    expect(emb.calls).toBe(calls + 1);
    await app.close();
  });
  // ---- SPEC-2026-10-12-memory-curation, Task 2 --------------------------------
  it('PATCH { kept: true } sets kept_at, memory is listed without stale=true, updated_at unchanged', async () => {
    const app = await makeMemoryApp(pg);
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'Kept rule.' }) })).json();
    const old = new Date(Date.now() - 90 * 86_400_000);
    await pg.handle.db.update(t.memory).set({ lastUsedAt: old, createdAt: old }).where(eq(t.memory.id, m.id));
    const before = (await memRow(m.id))!.updatedAt;
    const res = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { kept: true } });
    expect(res.statusCode).toBe(200);
    expect(res.json().kept_at).not.toBeNull();
    expect(res.json().stale).toBe(false);
    expect((await memRow(m.id))!.updatedAt.toISOString()).toBe(before.toISOString());
    const listed = (await app.inject({ method: 'GET', url: '/memories' })).json().items.find((i: { id: string }) => i.id === m.id);
    expect(listed).toBeDefined();
    expect(listed.stale).toBe(false);
    await app.close();
  });

  it('PATCH { archived: false } clears merged_into', async () => {
    const app = await makeMemoryApp(pg);
    const target = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'Target.' }) })).json();
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'Merged away.' }) })).json();
    await pg.handle.db.update(t.memory).set({ archivedAt: new Date(), mergedInto: target.id }).where(eq(t.memory.id, m.id));
    expect((await app.inject({ method: 'GET', url: `/memories/${m.id}` })).json().merged_into).toBe(target.id);
    const res = await app.inject({ method: 'PATCH', url: `/memories/${m.id}`, payload: { archived: false } });
    expect(res.json()).toMatchObject({ archived_at: null, merged_into: null });
    await app.close();
  });

  it('deleting the target sets merged_into to null', async () => {
    const app = await makeMemoryApp(pg);
    const target = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'Target 2.' }) })).json();
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ content: 'Merged away 2.' }) })).json();
    await pg.handle.db.update(t.memory).set({ archivedAt: new Date(), mergedInto: target.id }).where(eq(t.memory.id, m.id));
    await app.inject({ method: 'DELETE', url: `/memories/${target.id}` });
    const row = (await memRow(m.id))!;
    expect(row.mergedInto).toBeNull();
    expect(row.archivedAt).not.toBeNull();
    await app.close();
  });
});
