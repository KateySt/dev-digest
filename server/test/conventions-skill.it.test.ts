import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SKILL_SCAN_SCHEMA_NAME } from '../src/modules/skills/constants.js';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';

/** SPEC-2026-10-16-convention-skills — skills built from a selection of
 *  accepted conventions, linked back via `conventions.skill_id`. */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('conventions → skill (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function app() {
    const mockLlm = (id: 'openai' | 'openrouter') =>
      new MockLLMProvider(id, { structuredBySchema: { [SKILL_SCAN_SCHEMA_NAME]: { findings: [] } } });
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        llm: { openai: mockLlm('openai'), openrouter: mockLlm('openrouter') },
      },
    });
  }

  /** A fresh repo with conventions in the given statuses; returns their ids in order. */
  async function setup(statuses: ('pending' | 'accepted' | 'rejected')[]) {
    const db = pg.handle.db;
    const name = `conv-repo-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const rows = await db
      .insert(t.conventions)
      .values(
        statuses.map((status, i) => ({
          workspaceId,
          repoId: repo!.id,
          rule: `Rule ${i}`,
          evidencePath: `src/f${i}.ts`,
          evidenceSnippet: `x${i}`,
          confidence: 0.9,
          status,
        })),
      )
      .returning();
    return { repoId: repo!.id, ids: rows.map((r) => r.id) };
  }

  const payload = (ids: string[], scope: 'repo' | 'global', name = 'From conventions') => ({
    convention_ids: ids,
    name,
    type: 'convention',
    body: '# Rules\n- Rule',
    scope,
  });

  it('AC-1/AC-2/AC-3: scope repo binds the skill to the repo and links the conventions', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted', 'accepted', 'accepted']);

    const res = await a.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: payload(ids.slice(0, 2), 'repo', 'API errors'),
    });
    expect(res.statusCode).toBe(201);
    const { skill, conventions } = res.json();
    expect(skill.repo_id).toBe(repoId);
    expect(skill.source).toBe('extracted');

    const byId = new Map(conventions.map((c: { id: string }) => [c.id, c]));
    expect(byId.get(ids[0])).toMatchObject({ status: 'accepted', skill: { id: skill.id, name: 'API errors', repo_id: repoId } });
    expect(byId.get(ids[1])).toMatchObject({ skill: { id: skill.id } });
    expect(byId.get(ids[2])).toMatchObject({ status: 'accepted', skill: null });

    const listed = (await a.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(listed.find((c: { id: string }) => c.id === ids[0]).skill.id).toBe(skill.id);
    await a.close();
  });

  it('AC-3: scope global leaves repo_id null', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted']);
    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload(ids, 'global') });
    expect(res.statusCode).toBe(201);
    expect(res.json().skill.repo_id).toBeNull();
    await a.close();
  });

  it('AC-7: the skill scan runs before the transaction opens', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted']);
    const order: string[] = [];
    // Wrap the real methods so they still run, recording only the call order.
    const realPrepare = a.container.skillsService.prepareCreate.bind(a.container.skillsService);
    const prepareSpy = vi.spyOn(a.container.skillsService, 'prepareCreate').mockImplementation(async (...args) => {
      order.push('scan');
      return realPrepare(...args);
    });
    const realTx = a.container.db.transaction.bind(a.container.db);
    const txSpy = vi.spyOn(a.container.db, 'transaction').mockImplementation(((fn: never) => {
      order.push('tx');
      return realTx(fn);
    }) as never);

    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload(ids, 'repo') });
    expect(res.statusCode).toBe(201);
    expect(order).toEqual(['scan', 'tx']);
    txSpy.mockRestore();
    prepareSpy.mockRestore();
    await a.close();
  });

  it('AC-4: a convention from another repo → 404, nothing written', async () => {
    const a = await app();
    const one = await setup(['accepted']);
    const other = await setup(['accepted']);
    const before = (await pg.handle.db.select().from(t.skills)).length;

    const res = await a.inject({
      method: 'POST',
      url: `/repos/${one.repoId}/conventions/skill`,
      payload: payload([one.ids[0]!, other.ids[0]!], 'repo'),
    });
    expect(res.statusCode).toBe(404);
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before);
    await a.close();
  });

  it('AC-5: pending, rejected or already linked → 409 convention_unavailable, nothing written', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted', 'pending', 'rejected', 'accepted']);
    await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload([ids[3]!], 'repo') });
    const before = (await pg.handle.db.select().from(t.skills)).length;

    const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload(ids, 'repo') });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('convention_unavailable');
    expect(res.json().error.details.ids.sort()).toEqual([ids[1], ids[2], ids[3]].sort());
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before);
    const [first] = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.id, ids[0]!));
    expect(first!.skillId).toBeNull();
    await a.close();
  });

  it('AC-6: concurrent requests over overlapping conventions → one skill, one 409', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted', 'accepted', 'accepted']);
    const before = (await pg.handle.db.select().from(t.skills)).length;

    const [r1, r2] = await Promise.all([
      a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload([ids[0]!, ids[1]!], 'repo', 'A') }),
      a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload([ids[1]!, ids[2]!], 'repo', 'B') }),
    ]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([201, 409]);
    expect((await pg.handle.db.select().from(t.skills)).length).toBe(before + 1);
    await a.close();
  });

  it('AC-8/AC-9: rejecting a used convention → 409 until it is unlinked', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted']);
    await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload(ids, 'repo') });

    const blocked = await a.inject({ method: 'PATCH', url: `/conventions/${ids[0]}`, payload: { status: 'rejected' } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('convention_in_use');

    const unlinked = await a.inject({ method: 'PATCH', url: `/conventions/${ids[0]}`, payload: { skill_id: null } });
    expect(unlinked.statusCode).toBe(200);
    expect(unlinked.json()).toMatchObject({ status: 'accepted', skill: null });

    const rejected = await a.inject({ method: 'PATCH', url: `/conventions/${ids[0]}`, payload: { status: 'rejected' } });
    expect(rejected.json().status).toBe('rejected');
    await a.close();
  });

  it('AC-8: PATCH cannot link a convention to a skill', async () => {
    const a = await app();
    const { ids } = await setup(['accepted']);
    const res = await a.inject({
      method: 'PATCH',
      url: `/conventions/${ids[0]}`,
      payload: { skill_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    await a.close();
  });

  it('AC-10: deleting the skill returns its conventions to ready (still accepted)', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted', 'accepted']);
    const { skill } = (
      await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload(ids, 'repo') })
    ).json();

    expect((await a.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    const rows = await pg.handle.db.select().from(t.conventions).where(inArray(t.conventions.id, ids));
    expect(rows.every((r) => r.skillId === null && r.status === 'accepted')).toBe(true);
    await a.close();
  });

  it('AC-11: the re-scan cleanup keeps used conventions', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted', 'pending']);
    await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload([ids[0]!], 'repo') });

    await new ConventionsRepository(pg.handle.db).deleteNotAccepted(workspaceId, repoId);
    const left = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repoId));
    expect(left.map((r) => r.id)).toEqual([ids[0]]);
    await a.close();
  });

  it('AC-12: editing a used convention rule leaves the skill body unchanged', async () => {
    const a = await app();
    const { repoId, ids } = await setup(['accepted']);
    const { skill } = (
      await a.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill`, payload: payload(ids, 'repo') })
    ).json();

    const res = await a.inject({ method: 'PATCH', url: `/conventions/${ids[0]}`, payload: { rule: 'Changed rule' } });
    expect(res.json()).toMatchObject({ rule: 'Changed rule', skill: { id: skill.id } });
    const after = (await a.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(after.body).toBe(skill.body);
    await a.close();
  });
});
