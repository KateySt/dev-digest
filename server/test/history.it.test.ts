/**
 * GET /pulls/:id/history — "Prior PRs touching these files". Unlike `blast`,
 * this module's join/filter/order/limit logic has no existing tested
 * dependency to lean on (blast delegates the hard part to already-tested
 * repo-intel), so it gets its own DB-backed coverage here, plus a direct
 * `HistoryRepository` test for the "cap by distinct PR, not join row" rule.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { HistoryRepository } from '../src/modules/history/repository.js';
import type { PrHistory } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepo(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `history-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  return repo!;
}

let prSeq = 100;
async function insertPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  repoId: string,
  opts: { title: string; status: string; updatedAt?: Date | null; openedAt?: Date | null },
) {
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number: prSeq++,
      title: opts.title,
      author: 'marisa.koch',
      branch: 'feat/x',
      base: 'main',
      headSha: 'deadbeef',
      status: opts.status,
      updatedAt: opts.updatedAt ?? null,
      openedAt: opts.openedAt ?? null,
    })
    .returning();
  return pr!;
}

async function insertFiles(db: PgFixture['handle']['db'], prId: string, paths: string[]) {
  if (paths.length === 0) return;
  await db.insert(t.prFiles).values(paths.map((path) => ({ prId, path })));
}

d('GET /pulls/:id/history (Testcontainers pg)', () => {
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

  it('returns overlapping merged/closed PRs, most-recently-updated first, excluding open PRs and non-overlapping PRs', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await setupRepo(pg.handle.db, workspaceId);

    const current = await insertPr(pg.handle.db, workspaceId, repo.id, { title: 'Current PR', status: 'open' });
    await insertFiles(pg.handle.db, current.id, ['src/a.ts', 'src/b.ts']);

    const older = await insertPr(pg.handle.db, workspaceId, repo.id, {
      title: 'Older merged overlap',
      status: 'merged',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await insertFiles(pg.handle.db, older.id, ['src/a.ts']);

    const newer = await insertPr(pg.handle.db, workspaceId, repo.id, {
      title: 'Newer closed overlap',
      status: 'closed',
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });
    await insertFiles(pg.handle.db, newer.id, ['src/b.ts', 'src/a.ts']);

    // Still open + overlapping — excluded by the merged/closed status filter,
    // even though it's the most recently updated of all of them.
    const openOverlap = await insertPr(pg.handle.db, workspaceId, repo.id, {
      title: 'Still-open overlap',
      status: 'open',
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    });
    await insertFiles(pg.handle.db, openOverlap.id, ['src/a.ts']);

    // Merged but no overlapping files — excluded by the path filter.
    const nonOverlap = await insertPr(pg.handle.db, workspaceId, repo.id, {
      title: 'Merged, no overlap',
      status: 'merged',
      updatedAt: new Date('2026-02-15T00:00:00Z'),
    });
    await insertFiles(pg.handle.db, nonOverlap.id, ['src/z.ts']);

    const res = await app.inject({ method: 'GET', url: `/pulls/${current.id}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as PrHistory;

    const numbers = body.history.map((h) => h.pr_number);
    expect(numbers).toEqual([newer.number, older.number]);

    const newerItem = body.history.find((h) => h.pr_number === newer.number);
    expect(newerItem?.files_overlap).toEqual(['src/a.ts', 'src/b.ts']);
    expect(newerItem?.notes).toBe('shares 2 files with this PR');
    expect(newerItem?.merged_at).toBe(new Date('2026-02-01T00:00:00Z').toISOString());
    expect(newerItem?.author).toBe('marisa.koch');
    expect(newerItem?.title).toBe('Newer closed overlap');

    const olderItem = body.history.find((h) => h.pr_number === older.number);
    expect(olderItem?.files_overlap).toEqual(['src/a.ts']);
    expect(olderItem?.notes).toBe('shares 1 file with this PR');

    await app.close();
  });

  it('returns an empty history array when the current PR has no changed files', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const current = await insertPr(pg.handle.db, workspaceId, repo.id, { title: 'No files PR', status: 'open' });

    const res = await app.inject({ method: 'GET', url: `/pulls/${current.id}/history` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ history: [] });
    await app.close();
  });

  it('rejects an unknown PR id with 404', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/history',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('HistoryRepository caps by DISTINCT PR, not join row — a multi-file overlap PR does not crowd out a single-file one incorrectly, and every overlapping file of a capped-in PR is still returned', async () => {
    const repo = await setupRepo(pg.handle.db, workspaceId);
    const current = await insertPr(pg.handle.db, workspaceId, repo.id, { title: 'Current PR', status: 'open' });
    await insertFiles(pg.handle.db, current.id, ['src/a.ts', 'src/b.ts', 'src/c.ts']);

    // Most recently updated, overlaps on 2 files.
    const mostRecent = await insertPr(pg.handle.db, workspaceId, repo.id, {
      title: 'Most recent, 2-file overlap',
      status: 'merged',
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    });
    await insertFiles(pg.handle.db, mostRecent.id, ['src/a.ts', 'src/b.ts']);

    // Older, overlaps on 1 file — should be capped OUT entirely when limit=1.
    const older = await insertPr(pg.handle.db, workspaceId, repo.id, {
      title: 'Older, 1-file overlap',
      status: 'merged',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    await insertFiles(pg.handle.db, older.id, ['src/c.ts']);

    const historyRepo = new HistoryRepository(pg.handle.db);
    const rows = await historyRepo.findOverlappingPrs(repo.id, current.id, ['src/a.ts', 'src/b.ts', 'src/c.ts'], 1);

    // Exactly one distinct PR (the most recent), with BOTH its overlapping
    // files present — a naive `LIMIT 1` on the raw join would have returned
    // only 1 row total instead.
    const ids = new Set(rows.map((r) => r.id));
    expect(ids).toEqual(new Set([mostRecent.id]));
    expect(rows.map((r) => r.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
