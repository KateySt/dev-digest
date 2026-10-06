import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { defaultWorkspaceId, insertSkill, uniq } from './helpers/eval-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * SPEC-02 S-AC-13..16 — skill-link changes version the agent; snapshots record
 * each skill's own version; "Promote vN" re-applies a snapshot as a NEW version.
 * (Complements agents-versions.it.test.ts, which covers the plain config history.)
 */
d('agent skill-link versioning and promote (Testcontainers pg)', () => {
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

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  type TestApp = Awaited<ReturnType<typeof makeApp>>;

  async function newAgent(app: TestApp) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: uniq('Linked'), provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review the diff.' },
      })
    ).json() as { id: string; version: number };
  }
  const setSkills = (app: TestApp, agentId: string, ids: string[]) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: ids } });
  const versions = async (app: TestApp, agentId: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })).json() as Array<{
      version: number;
      config: { model: string; system_prompt: string; skills: Array<{ id: string; version: number; name?: string }> };
    }>;
  const currentVersion = async (app: TestApp, agentId: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${agentId}` })).json().version as number;

  it('S-13/S-14: link, add, reorder and unlink each bump the version exactly once, with a snapshot of {id, version, name}', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const s1 = await insertSkill(pg.handle.db, ws, 'Alpha');
    const s2 = await insertSkill(pg.handle.db, ws, 'Beta');
    await pg.handle.db.update(t.skills).set({ version: 3 }).where(eq(t.skills.id, s2.id));

    await setSkills(app, agent.id, [s1.id]); // link -> v2
    expect(await currentVersion(app, agent.id)).toBe(2);
    await setSkills(app, agent.id, [s1.id, s2.id]); // add -> v3
    expect(await currentVersion(app, agent.id)).toBe(3);
    await setSkills(app, agent.id, [s2.id, s1.id]); // reorder -> v4
    expect(await currentVersion(app, agent.id)).toBe(4);
    await setSkills(app, agent.id, [s2.id]); // unlink -> v5
    expect(await currentVersion(app, agent.id)).toBe(5);

    const vs = await versions(app, agent.id);
    expect(vs.map((v) => v.version)).toEqual([5, 4, 3, 2, 1]); // one snapshot per change
    const at = (n: number) => vs.find((v) => v.version === n)!.config.skills;
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual([{ id: s1.id, version: 1, name: 'Alpha' }]);
    expect(at(3)).toEqual([
      { id: s1.id, version: 1, name: 'Alpha' },
      { id: s2.id, version: 3, name: 'Beta' }, // the skill's OWN version at snapshot time
    ]);
    expect(at(4).map((s) => s.id)).toEqual([s2.id, s1.id]); // order preserved
    expect(at(5).map((s) => s.id)).toEqual([s2.id]);
    await app.close();
  });

  it('S-13: re-saving an identical ordered skill list does not bump the version', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const s1 = await insertSkill(pg.handle.db, ws);
    await setSkills(app, agent.id, [s1.id]);
    await setSkills(app, agent.id, [s1.id]);
    expect(await currentVersion(app, agent.id)).toBe(2);
    expect(await versions(app, agent.id)).toHaveLength(2);
    await app.close();
  });

  it('S-13: link-one (skill_id) also bumps; the FK-cascade unlink from deleting a skill does not', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const s1 = await insertSkill(pg.handle.db, ws);
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_id: s1.id } });
    expect(await currentVersion(app, agent.id)).toBe(2);

    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, s1.id));
    expect(await currentVersion(app, agent.id)).toBe(2);
    expect(await versions(app, agent.id)).toHaveLength(2);
    await app.close();
  });

  it('S-15: promote v2 applies its model/prompt/strategy/skill order as max+1 and snapshots it; history is immutable', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const s1 = await insertSkill(pg.handle.db, ws, 'One');
    const s2 = await insertSkill(pg.handle.db, ws, 'Two');
    await setSkills(app, agent.id, [s2.id, s1.id]); // v2 (skills in order two, one)
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { model: 'gpt-4o', system_prompt: 'Changed prompt', strategy: 'map-reduce' },
    }); // v3
    await setSkills(app, agent.id, []); // v4

    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/versions/2/promote` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      version: 5,
      model: 'gpt-4o-mini',
      system_prompt: 'Review the diff.',
      strategy: 'single-pass', // v2's strategy, not v3's map-reduce
    });

    const rows = await pg.handle.db
      .select()
      .from(t.agentSkills)
      .where(eq(t.agentSkills.agentId, agent.id))
      .orderBy(t.agentSkills.order);
    expect(rows.map((r) => r.skillId)).toEqual([s2.id, s1.id]);

    const vs = await versions(app, agent.id);
    expect(vs.map((v) => v.version)).toEqual([5, 4, 3, 2, 1]);
    expect(vs[0]!.config.skills.map((s) => s.id)).toEqual([s2.id, s1.id]);
    expect(vs[0]!.config).toMatchObject({ model: 'gpt-4o-mini', system_prompt: 'Review the diff.' });
    expect(vs.find((v) => v.version === 3)!.config.model).toBe('gpt-4o'); // untouched
    await app.close();
  });

  it("S-16: skill text is NOT rolled back - a promoted link keeps the skill's current body and version", async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const s1 = await insertSkill(pg.handle.db, ws, 'Evolving', 'old text');
    await setSkills(app, agent.id, [s1.id]); // v2 snapshot taken at skill version 1
    await pg.handle.db.update(t.skills).set({ body: 'new text', version: 2 }).where(eq(t.skills.id, s1.id));

    expect((await app.inject({ method: 'POST', url: `/agents/${agent.id}/versions/2/promote` })).statusCode).toBe(200);
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, s1.id));
    expect(row).toMatchObject({ body: 'new text', version: 2 });
    const top = (await versions(app, agent.id))[0]!;
    expect(top.config.skills).toEqual([{ id: s1.id, version: 2, name: 'Evolving' }]);
    await app.close();
  });

  it('S-16: promote answers 409 listing missing skills and changes nothing', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    const keep = await insertSkill(pg.handle.db, ws, 'Keeper');
    const gone = await insertSkill(pg.handle.db, ws, 'Doomed');
    await setSkills(app, agent.id, [keep.id, gone.id]); // v2
    await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { model: 'gpt-4o' } }); // v3
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, gone.id));

    const before = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/versions/2/promote` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.missing_skills).toEqual([{ id: gone.id, name: 'Doomed' }]);

    const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(after).toEqual(before);
    expect(await versions(app, agent.id)).toHaveLength(3);
    await app.close();
  });

  it('promote of an unrecorded version is 404', async () => {
    const app = await makeApp();
    const agent = await newAgent(app);
    expect((await app.inject({ method: 'POST', url: `/agents/${agent.id}/versions/99/promote` })).statusCode).toBe(404);
    await app.close();
  });
});
