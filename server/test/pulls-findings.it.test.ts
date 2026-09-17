/**
 * GET /repos/:id/pulls — per-severity findings counts (findings badge on the
 * PR list). Counts come from the PR's latest `kind: 'review'` row only, same
 * selection as the score ring, so the two never disagree. No GitHub override
 * is needed: without one, `container.github()` throws (no token in test env)
 * and the route falls back to serving persisted rows — exactly what these
 * tests want, since they seed findings directly in Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `findings-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 11,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'deadbeef',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

async function addReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  score: number,
  severities: string[],
  createdAt: Date,
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, kind: 'review', score, createdAt })
    .returning();
  if (severities.length > 0) {
    await db.insert(t.findings).values(
      severities.map((severity, i) => ({
        reviewId: review!.id,
        file: `src/file${i}.ts`,
        startLine: 1,
        endLine: 1,
        severity,
        category: 'bug',
        title: `Finding ${i}`,
        rationale: 'because',
        confidence: 0.9,
      })),
    );
  }
  return review!;
}

d('GET /repos/:id/pulls findings counts (Testcontainers pg)', () => {
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

  it('counts findings by severity from the latest review', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // Older review — should NOT contribute to the counts.
    await addReview(
      pg.handle.db,
      workspaceId,
      pr.id,
      40,
      ['CRITICAL'],
      new Date('2026-01-01T00:00:00Z'),
    );
    // Latest review — this one wins.
    await addReview(
      pg.handle.db,
      workspaceId,
      pr.id,
      80,
      ['CRITICAL', 'CRITICAL', 'WARNING', 'SUGGESTION'],
      new Date('2026-01-02T00:00:00Z'),
    );

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row?.score).toBe(80);
    expect(row?.findings).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    await app.close();
  });

  it('zeroes findings for a PR with no reviews yet', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` });
    const body = res.json() as PrMeta[];
    const row = body.find((p) => p.id === pr.id);
    expect(row?.score).toBeNull();
    expect(row?.findings).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    await app.close();
  });
});
