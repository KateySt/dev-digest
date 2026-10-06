import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { defaultWorkspaceId, eq, insertFindingFixture, makeApp } from './helpers/eval-fixtures.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/** A GitHub that refuses every inline comment (e.g. line outside the diff, closed PR). */
class RejectingGitHub extends MockGitHubClient {
  override async createReviewComment(): Promise<never> {
    throw new Error('Validation Failed: pull_request_review_thread.line must be part of the diff');
  }
}

/**
 * SPEC-02 S-AC-47..50 — POST /findings/:id/reply ("Reply to author").
 */
d('POST /findings/:id/reply (Testcontainers pg)', () => {
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

  const row = async (id: string) =>
    (await pg.handle.db.select().from(t.findings).where(eq(t.findings.id, id)))[0]!;

  it('S-47/S-48: posts the body verbatim as an inline comment at head sha, file and end line; stores URL + time; returns the comment', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(pg, { github });
    const { finding, pr } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });
    const body = '  Please remove this.\n\n```ts\nconst x = 1;\n```  '; // whitespace + markdown preserved

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/reply`, payload: { reply: body } });
    expect(res.statusCode).toBe(200);
    expect(github.createdComments).toHaveLength(1);
    expect(github.createdComments[0]).toMatchObject({
      commitId: pr.headSha,
      path: 'src/config.ts',
      line: 52, // the finding's end_line
      body,
    });
    expect(res.json()).toMatchObject({ body, html_url: expect.stringContaining('github.com') });

    const stored = await row(finding.id);
    expect(stored.replyUrl).toBe(res.json().html_url);
    expect(stored.repliedAt).toBeInstanceOf(Date);

    // ... and the finding data now includes both.
    const listed = (await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` }))
      .json()
      .flatMap((r: { findings: { id: string; reply_url: string | null; replied_at: string | null }[] }) => r.findings)
      .find((f: { id: string }) => f.id === finding.id);
    expect(listed.reply_url).toBe(res.json().html_url);
    expect(typeof listed.replied_at).toBe('string');
    await app.close();
  });

  it('S-49: a second reply answers 409 and posts nothing', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(pg, { github });
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });

    expect((await app.inject({ method: 'POST', url: `/findings/${finding.id}/reply`, payload: { reply: 'one' } })).statusCode).toBe(200);
    const first = await row(finding.id);
    const second = await app.inject({ method: 'POST', url: `/findings/${finding.id}/reply`, payload: { reply: 'two' } });
    expect(second.statusCode).toBe(409);
    expect(github.createdComments).toHaveLength(1);
    expect((await row(finding.id)).replyUrl).toBe(first.replyUrl);
    await app.close();
  });

  it("S-50: GitHub's rejection becomes a 400 carrying GitHub's reason, and nothing is recorded as posted", async () => {
    const app = await makeApp(pg, { github: new RejectingGitHub() });
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/reply`, payload: { reply: 'hello' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('must be part of the diff');
    const stored = await row(finding.id);
    expect(stored.replyUrl).toBeNull();
    expect(stored.repliedAt).toBeNull();
    await app.close();
  });

  it('S-50: with GitHub not connected the answer is 400 and nothing is recorded; the user can retry once connected', async () => {
    const app = await makeApp(pg, { github: null }); // no override and no GITHUB_TOKEN in the test env
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });

    const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/reply`, payload: { reply: 'hello' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('github_unavailable');
    expect((await row(finding.id)).replyUrl).toBeNull();
    await app.close();
  });

  it('validates the body (empty reply -> 422) and 404s for an unknown finding', async () => {
    const github = new MockGitHubClient();
    const app = await makeApp(pg, { github });
    const { finding } = await insertFindingFixture(pg.handle.db, ws, { agentId: null });

    expect((await app.inject({ method: 'POST', url: `/findings/${finding.id}/reply`, payload: { reply: '' } })).statusCode).toBe(422);
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'POST', url: `/findings/${ghost}/reply`, payload: { reply: 'x' } })).statusCode).toBe(404);
    expect(github.createdComments).toHaveLength(0);
    await app.close();
  });
});
