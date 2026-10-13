import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { defaultWorkspaceId, eq, insertFindingFixture, makeAgent } from './helpers/eval-fixtures.js';
import { makeMemoryApp, memoryBody } from './helpers/memory-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DRAFT = {
  content: 'Debug flags are toggled by config in this repo — do not flag `debug: true` in src/config.ts.',
  kind: 'learning',
  path_glob: 'src/config.ts',
  confidence: 0.82,
};

const draftLlm = () => new MockLLMProvider('openai', { structuredBySchema: { memory_draft: DRAFT } });

/** SPEC-2026-10-12-memory AC-2..AC-8 — POST /findings/:id/learn/draft. */
d('Learn draft (Testcontainers pg)', () => {
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

  const draft = (app: Awaited<ReturnType<typeof makeMemoryApp>>, findingId: string) =>
    app.inject({ method: 'POST', url: `/findings/${findingId}/learn/draft` });

  it('draft returns LLM content, repo scope, producing agent link', async () => {
    const llm = draftLlm();
    const app = await makeMemoryApp(pg, { llm });
    const agent = await makeAgent(app);
    const { finding, repo, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: agent.id, decision: 'dismissed' });
    const res = await draft(app, finding.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.draft).toMatchObject({
      content: DRAFT.content,
      kind: 'learning',
      scope: 'repo',
      repo_id: repo.id,
      path_globs: ['src/config.ts'],
      links: [{ target_kind: 'agent', target_id: agent.id }],
      applies_to_all_agents: false,
      confidence: 0.82,
      fallback: false,
    });
    expect(body.source).toMatchObject({ pr: pr.number, finding_id: finding.id });
    expect(body.existing_memory_id).toBeNull();
    expect(Array.isArray(body.similar)).toBe(true);
    // the finding + its decision reached the model
    const call = llm.calls.find((c) => c.method === 'completeStructured')!;
    const prompt = JSON.stringify((call.req as { messages: unknown }).messages);
    expect(prompt).toContain('Debug flag left on in production!');
    expect(prompt).toContain('dismissed');
    await app.close();
  });

  it('draft writes no memory rows (AC-6)', async () => {
    const app = await makeMemoryApp(pg, { llm: draftLlm() });
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    const before = (await pg.handle.db.select().from(t.memory)).length;
    expect((await draft(app, finding.id)).statusCode).toBe(200);
    expect((await pg.handle.db.select().from(t.memory)).length).toBe(before);
    await app.close();
  });

  it('draft drops an invalid LLM glob', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { memory_draft: { ...DRAFT, path_glob: '/etc/[x' } } });
    const app = await makeMemoryApp(pg, { llm });
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    expect((await draft(app, finding.id)).json().draft.path_globs).toEqual([]);
    await app.close();
  });

  it('draft falls back when LLM throws (AC-5)', async () => {
    // No memory_draft fixture → the mock's default fixture fails the draft schema → throws.
    const app = await makeMemoryApp(pg);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null, decision: 'accepted' });
    const res = await draft(app, finding.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().draft).toMatchObject({
      fallback: true,
      kind: 'fact',
      content: 'Debug flag left on in production!: because',
      applies_to_all_agents: true,
      links: [],
    });
    await app.close();
  });

  it('draft for learned finding returns existing_memory_id and skips the LLM', async () => {
    const llm = draftLlm();
    const app = await makeMemoryApp(pg, { llm });
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ finding_id: finding.id, content: 'Saved rule.' }) })).json();
    const res = (await draft(app, finding.id)).json();
    expect(res.existing_memory_id).toBe(m.id);
    expect(res.draft.content).toBe('Saved rule.');
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(0);
    await app.close();
  });

  it('404 for a finding in no workspace', async () => {
    const app = await makeMemoryApp(pg, { llm: draftLlm() });
    expect((await draft(app, '00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
    await app.close();
  });

  it('finding DTO exposes memory_id after create', async () => {
    const app = await makeMemoryApp(pg);
    const { finding, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    const m = (await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ finding_id: finding.id }) })).json();
    const listed = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` }))
      .json()
      .flatMap((r: { findings: { id: string; memory_id?: string | null }[] }) => r.findings)
      .find((f: { id: string }) => f.id === finding.id);
    expect(listed.memory_id).toBe(m.id);
    await app.close();
  });

  it('learn does not change accepted_at/dismissed_at (AC-8)', async () => {
    const app = await makeMemoryApp(pg);
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null, decision: 'dismissed' });
    const before = (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, finding.id)))[0]!;
    await app.inject({ method: 'POST', url: '/memories', payload: memoryBody({ finding_id: finding.id }) });
    const after = (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, finding.id)))[0]!;
    expect(after.dismissedAt?.toISOString()).toBe(before.dismissedAt?.toISOString());
    expect(after.acceptedAt).toBeNull();
    await app.close();
  });
});
