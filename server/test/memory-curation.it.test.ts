import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { defaultWorkspaceId, eq, insertFindingFixture, insertSkill, uniq } from './helpers/eval-fixtures.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { FailingEmbedder, WordEmbedder, insertRepo, makeMemoryApp, memoryBody } from './helpers/memory-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

type Scan = {
  groups: { members: { id: string }[]; primary_id: string; similarity: number }[];
  stale: { memory: { id: string }; reasons: string[] }[];
  totals: { groups: number; stale: number };
  mode: 'semantic' | 'text';
};

/** SPEC-2026-10-12-memory-curation — scan, merge draft, merge apply. */
d('memory curation (Testcontainers pg)', () => {
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

  /** A sentence unique to one test, so memories from other tests never group with it. */
  const sentence = () => {
    const w = uniq('zq').replace(/[^a-z0-9]/gi, '');
    return `${w}alpha ${w}bravo ${w}charlie ${w}delta ${w}echo ${w}foxtrot.`;
  };
  const create = async (app: Awaited<ReturnType<typeof makeMemoryApp>>, over: Record<string, unknown> = {}) =>
    (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody(over) })).json() as {
      id: string;
      updated_at: string;
    };
  const scan = async (app: Awaited<ReturnType<typeof makeMemoryApp>>, repoId?: string) => {
    const res = await app.inject({ method: 'POST', url: '/memories/curate/scan', payload: repoId ? { repo_id: repoId } : {} });
    expect(res.statusCode).toBe(200);
    return res.json() as Scan;
  };
  const groupOf = (s: Scan, id: string) => s.groups.find((g) => g.members.some((m) => m.id === id));

  it('scan groups near-duplicates (semantic)', async () => {
    const app = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const text = sentence();
    const a = await create(app, { content: text });
    const b = await create(app, { content: text });
    const c = await create(app, { content: sentence() });
    const s = await scan(app);
    expect(s.mode).toBe('semantic');
    const g = groupOf(s, a.id)!;
    expect(g.members.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
    expect(groupOf(s, c.id)).toBeUndefined();
    await app.close();
  });

  it('scan falls back to text when embedding fails', async () => {
    const app = await makeMemoryApp(pg, { embedder: new FailingEmbedder() });
    const text = sentence();
    const a = await create(app, { content: text });
    const b = await create(app, { content: text });
    const s = await scan(app);
    expect(s.mode).toBe('text');
    expect(groupOf(s, a.id)!.members.map((m) => m.id)).toContain(b.id);
    await app.close();
  });

  it('scan scope is repo + global only', async () => {
    const app = await makeMemoryApp(pg);
    const repoA = await insertRepo(pg.handle.db, ws);
    const repoB = await insertRepo(pg.handle.db, ws);
    const text = sentence();
    const inA1 = await create(app, { content: text, scope: 'repo', repo_id: repoA.id });
    const inA2 = await create(app, { content: text, scope: 'repo', repo_id: repoA.id });
    const inB1 = await create(app, { content: text, scope: 'repo', repo_id: repoB.id });
    const glob = await create(app, { content: text });

    const s = await scan(app, repoA.id);
    const ids = groupOf(s, inA1.id)!.members.map((m) => m.id).sort();
    expect(ids).toEqual([inA1.id, inA2.id, glob.id].sort());
    expect(groupOf(s, inB1.id)).toBeUndefined();

    const globalOnly = await scan(app);
    expect(groupOf(globalOnly, inA1.id)).toBeUndefined();
    await app.close();
  });

  it('scan returns stale with reasons and excludes group members', async () => {
    const app = await makeMemoryApp(pg);
    const old = new Date(Date.now() - 90 * 86_400_000);
    const unused = await create(app, { content: sentence() });
    await pg.handle.db.update(t.memory).set({ createdAt: old }).where(eq(t.memory.id, unused.id));
    const unlinked = await create(app, { content: sentence() });
    await pg.handle.db.update(t.memory).set({ appliesToAllAgents: false }).where(eq(t.memory.id, unlinked.id));
    const text = sentence();
    const dupOld = await create(app, { content: text });
    await create(app, { content: text });
    await pg.handle.db.update(t.memory).set({ createdAt: old }).where(eq(t.memory.id, dupOld.id));

    const s = await scan(app);
    const reasonsOf = (id: string) => s.stale.find((c) => c.memory.id === id)?.reasons;
    expect(reasonsOf(unused.id)).toEqual(['unused']);
    expect(reasonsOf(unlinked.id)).toEqual(['unlinked']);
    expect(reasonsOf(dupOld.id)).toBeUndefined();
    expect(groupOf(s, dupOld.id)).toBeDefined();
    await app.close();
  });

  it('members of a group cut by the size cap are not listed as stale', async () => {
    const app = await makeMemoryApp(pg);
    const text = sentence();
    const old = new Date(Date.now() - 90 * 86_400_000);
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) ids.push((await create(app, { content: text })).id);
    for (const id of ids) await pg.handle.db.update(t.memory).set({ createdAt: old }).where(eq(t.memory.id, id));
    const s = await scan(app);
    expect(groupOf(s, ids[0]!) ?? groupOf(s, ids[11]!)).toBeDefined();
    expect(s.stale.filter((c) => ids.includes(c.memory.id))).toEqual([]);
    await app.close();
  });

  it('scan writes nothing', async () => {
    const app = await makeMemoryApp(pg, { embedder: new WordEmbedder() });
    const text = sentence();
    const a = await create(app, { content: text });
    await create(app, { content: text });
    // a row saved during an embedding outage: the scan embeds it in memory only
    await pg.handle.db.update(t.memory).set({ embedding: null }).where(eq(t.memory.id, a.id));
    const before = await pg.handle.db.select().from(t.memory);
    await scan(app);
    const after = await pg.handle.db.select().from(t.memory);
    expect(after).toEqual(before);
    await app.close();
  });

  it('scan skips archived memories', async () => {
    const app = await makeMemoryApp(pg);
    const text = sentence();
    const a = await create(app, { content: text });
    const b = await create(app, { content: text });
    await app.inject({ method: 'PATCH', url: `/memories/${b.id}`, payload: { archived: true } });
    const s = await scan(app);
    expect(groupOf(s, a.id)).toBeUndefined();
    expect(groupOf(s, b.id)).toBeUndefined();
    await app.close();
  });
  // ---- Task 4: merge draft + merge apply ------------------------------------
  type Mem = {
    id: string;
    updated_at: string;
    content: string;
    sources: unknown[];
    archived_at: string | null;
    merged_into: string | null;
  };
  const getMem = async (app: Awaited<ReturnType<typeof makeMemoryApp>>, id: string) =>
    (await app.inject({ method: 'GET', url: `/memories/${id}` })).json() as Mem;
  const mergeBody = (primary: Mem, members: Mem[], over: Record<string, unknown> = {}) => ({
    primary_id: primary.id,
    member_ids: members.map((m) => m.id),
    expected: Object.fromEntries(members.map((m) => [m.id, m.updated_at])),
    result: memoryBody({ content: 'Merged rule — because it matters.' }),
    ...over,
  });
  const merge = (app: Awaited<ReturnType<typeof makeMemoryApp>>, body: unknown) =>
    app.inject({ method: 'POST', url: '/memories/curate/merge', payload: body });

  it('merge-draft returns LLM content and persists nothing', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { memory_merge_draft: { content: 'Merged.' } } });
    const app = await makeMemoryApp(pg, { llm });
    const a = await create(app, { content: sentence() });
    const b = await create(app, { content: sentence() });
    const before = await pg.handle.db.select().from(t.memory);
    const res = await app.inject({
      method: 'POST',
      url: '/memories/curate/merge-draft',
      payload: { member_ids: [a.id, b.id] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ content: 'Merged.', fallback: false });
    expect(await pg.handle.db.select().from(t.memory)).toEqual(before);
    await app.close();
  });

  it('merge-draft falls back to primary content when LLM throws', async () => {
    // No memory_merge_draft fixture → the default fixture fails the schema → throws.
    const app = await makeMemoryApp(pg);
    const low = await create(app, { content: sentence(), confidence: 0.3 });
    const high = await create(app, { content: sentence(), confidence: 0.9 });
    const res = await app.inject({
      method: 'POST',
      url: '/memories/curate/merge-draft',
      payload: { member_ids: [low.id, high.id] },
    });
    expect(res.json()).toEqual({ content: (await getMem(app, high.id)).content, fallback: true });
    await app.close();
  });

  it('merge folds members into primary', async () => {
    const app = await makeMemoryApp(pg);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    const p = await getMem(app, (await create(app, { content: sentence() })).id);
    const learned = await app.inject({
      method: 'POST',
      url: '/memories',
      payload: { ...memoryBody({ content: sentence() }), finding_id: finding.id },
    });
    const otherId = learned.json().id as string;
    const used = new Date(Date.now() - 86_400_000);
    await pg.handle.db.update(t.memory).set({ lastUsedAt: used }).where(eq(t.memory.id, otherId));
    const fresh = [await getMem(app, p.id), await getMem(app, otherId)];

    const res = await merge(app, mergeBody(fresh[0]!, fresh));
    expect(res.statusCode).toBe(200);
    expect(res.json().content).toBe('Merged rule — because it matters.');
    expect(res.json().sources).toHaveLength(fresh[0]!.sources.length + fresh[1]!.sources.length);
    expect(res.json().last_used_at).toBe(used.toISOString());
    const archived = await getMem(app, otherId);
    expect(archived.archived_at).not.toBeNull();
    expect(archived.merged_into).toBe(p.id);
    const f = (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, finding.id)))[0]!;
    expect(f.memoryId).toBe(p.id);
    await app.close();
  });

  it('merge returns 409 and writes nothing when a member changed', async () => {
    const app = await makeMemoryApp(pg);
    const a = await getMem(app, (await create(app, { content: sentence() })).id);
    const b = await getMem(app, (await create(app, { content: sentence() })).id);
    const body = mergeBody(a, [a, b], { expected: { [a.id]: a.updated_at, [b.id]: '2000-01-01T00:00:00.000Z' } });
    const before = await pg.handle.db.select().from(t.memory);
    const res = await merge(app, body);
    expect(res.statusCode).toBe(409);
    expect(await pg.handle.db.select().from(t.memory)).toEqual(before);
    await app.close();
  });

  it('merge rejects invalid result with 422', async () => {
    const app = await makeMemoryApp(pg);
    const repoA = await insertRepo(pg.handle.db, ws);
    const repoB = await insertRepo(pg.handle.db, ws);
    const skill = await insertSkill(pg.handle.db, ws);
    await pg.handle.db.update(t.skills).set({ repoId: repoB.id }).where(eq(t.skills.id, skill.id));
    const a = await getMem(app, (await create(app, { content: sentence(), scope: 'repo', repo_id: repoA.id })).id);
    const b = await getMem(app, (await create(app, { content: sentence() })).id);
    const badLink = mergeBody(a, [a, b], {
      repo_id: repoA.id,
      result: memoryBody({
        scope: 'repo',
        repo_id: repoA.id,
        applies_to_all_agents: false,
        links: [{ target_kind: 'skill', target_id: skill.id }],
      }),
    });
    expect((await merge(app, badLink)).statusCode).toBe(422);
    const tooManyGlobs = mergeBody(a, [a, b], {
      repo_id: repoA.id,
      result: memoryBody({ path_globs: Array.from({ length: 11 }, (_, i) => `src/${i}/**`) }),
    });
    expect((await merge(app, tooManyGlobs)).statusCode).toBe(422);
    const otherRepoResult = mergeBody(a, [a, b], {
      repo_id: repoA.id,
      result: memoryBody({ scope: 'repo', repo_id: repoB.id }),
    });
    expect((await merge(app, otherRepoResult)).statusCode).toBe(422);
    expect((await getMem(app, b.id)).archived_at).toBeNull();
    await app.close();
  });

  it('merge rejects a member outside the scanned scope', async () => {
    const app = await makeMemoryApp(pg);
    const repoA = await insertRepo(pg.handle.db, ws);
    const repoB = await insertRepo(pg.handle.db, ws);
    const a = await getMem(app, (await create(app, { content: sentence(), scope: 'repo', repo_id: repoA.id })).id);
    const b = await getMem(app, (await create(app, { content: sentence(), scope: 'repo', repo_id: repoB.id })).id);
    expect((await merge(app, mergeBody(a, [a, b], { repo_id: repoA.id }))).statusCode).toBe(422);
    await app.close();
  });

  it('merge rejects archived member', async () => {
    const app = await makeMemoryApp(pg);
    const a = await getMem(app, (await create(app, { content: sentence() })).id);
    const bId = (await create(app, { content: sentence() })).id;
    await app.inject({ method: 'PATCH', url: `/memories/${bId}`, payload: { archived: true } });
    const b = await getMem(app, bId);
    expect((await merge(app, mergeBody(a, [a, b]))).statusCode).toBe(422);
    await app.close();
  });

  it('merge rejects a primary that is not a member', async () => {
    const app = await makeMemoryApp(pg);
    const a = await getMem(app, (await create(app, { content: sentence() })).id);
    const b = await getMem(app, (await create(app, { content: sentence() })).id);
    const c = await getMem(app, (await create(app, { content: sentence() })).id);
    expect((await merge(app, mergeBody(c, [a, b]))).statusCode).toBe(422);
    await app.close();
  });

  it('unarchive clears merged_into, primary unchanged', async () => {
    const app = await makeMemoryApp(pg);
    const a = await getMem(app, (await create(app, { content: sentence() })).id);
    const b = await getMem(app, (await create(app, { content: sentence() })).id);
    const merged = (await merge(app, mergeBody(a, [a, b]))).json() as Mem;
    const res = await app.inject({ method: 'PATCH', url: `/memories/${b.id}`, payload: { archived: false } });
    expect(res.json()).toMatchObject({ archived_at: null, merged_into: null });
    const primary = await getMem(app, a.id);
    expect(primary.content).toBe(merged.content);
    expect(primary.sources).toHaveLength(merged.sources.length);
    await app.close();
  });
  it('JS full-text score equals Postgres ts_rank_cd for the AC-9 OR-query', async () => {
    const texts = [
      'Always wrap redis calls in retry because redis retries corrupt redis state.',
      'Redis retry wrapper: wrap every redis call, retries otherwise corrupt state.',
      "Don't flag try/catch around JSON.parse — it's intentional defensive parsing.",
      'bucketKey() must include the API version prefix or v1/v2 clients collide.',
    ];
    const { sql } = await import('drizzle-orm');
    const { parseTsvector, ftsScore } = await import('../src/modules/memory/helpers.js');
    for (const a of texts) {
      for (const b of texts) {
        if (a === b) continue;
        const res = (await pg.handle.db.execute(sql`
          select ts_rank_cd(to_tsvector('english', ${b}),
                 replace(plainto_tsquery('english', ${a})::text, '&', '|')::tsquery, 32) as score,
                 to_tsvector('english', ${a})::text as atsv,
                 to_tsvector('english', ${b})::text as btsv
        `)) as unknown as { score: number; atsv: string; btsv: string }[] | { rows: { score: number; atsv: string; btsv: string }[] };
        const row = (Array.isArray(res) ? res : res.rows)[0]!;
        const aLex = parseTsvector(row.atsv);
        const bLex = parseTsvector(row.btsv);
        let k = 0;
        for (const [l, n] of bLex) if (aLex.has(l)) k += n;
        expect(ftsScore(k)).toBeCloseTo(Number(row.score), 5);
      }
    }
  });
});
