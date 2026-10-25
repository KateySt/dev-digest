import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { DEFAULT_SCHEDULE, MAX_DOC_BYTES, MAX_WALK_ENTRIES, WALK_SKIP_DIRS } from './constants.js';

export type ScheduleRow = typeof t.docSyncSchedules.$inferSelect;
export type RunRow = typeof t.docSyncRuns.$inferSelect;
export type ResultRow = typeof t.docSyncRepoResults.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;

export interface ClonedTree {
  /** Repo-relative paths of every file and directory. */
  paths: Set<string>;
  /** Repo-relative paths of every `package.json`. */
  packageJsons: string[];
}

/**
 * Docs Sync persistence (Drizzle) + clone filesystem reads. The service never
 * touches Drizzle or `fs` itself.
 */
export class DocSyncRepository {
  constructor(private db: Db) {}

  // ---- schedule ---------------------------------------------------------

  async getOrCreateSchedule(workspaceId: string): Promise<ScheduleRow> {
    const [row] = await this.db
      .insert(t.docSyncSchedules)
      .values({ workspaceId, ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days] })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    const [existing] = await this.db
      .select()
      .from(t.docSyncSchedules)
      .where(eq(t.docSyncSchedules.workspaceId, workspaceId));
    return existing!;
  }

  async updateSchedule(workspaceId: string, patch: Partial<Omit<ScheduleRow, 'workspaceId'>>): Promise<ScheduleRow> {
    await this.getOrCreateSchedule(workspaceId);
    const [row] = await this.db
      .update(t.docSyncSchedules)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(t.docSyncSchedules.workspaceId, workspaceId))
      .returning();
    return row!;
  }

  /** Enabled schedules whose `next_run_at` has passed. */
  dueSchedules(now: Date): Promise<ScheduleRow[]> {
    return this.db
      .select()
      .from(t.docSyncSchedules)
      .where(
        and(
          eq(t.docSyncSchedules.enabled, true),
          isNotNull(t.docSyncSchedules.nextRunAt),
          sql`${t.docSyncSchedules.nextRunAt} <= ${now}`,
        ),
      );
  }

  // ---- repos ------------------------------------------------------------

  listRepos(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId)).orderBy(t.repos.fullName);
  }

  async getRepo(repoId: string): Promise<RepoRow | null> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row ?? null;
  }

  async updateRepo(
    workspaceId: string,
    repoId: string,
    patch: Partial<Pick<RepoRow, 'docSyncEnabled' | 'docSyncDismissed'>>,
  ): Promise<RepoRow | null> {
    if (Object.keys(patch).length === 0) {
      const [row] = await this.db
        .select()
        .from(t.repos)
        .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
      return row ?? null;
    }
    const [row] = await this.db
      .update(t.repos)
      .set(patch)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)))
      .returning();
    return row ?? null;
  }

  async markRepoChecked(repoId: string, sha: string): Promise<void> {
    await this.db
      .update(t.repos)
      .set({ docSyncLastSha: sha, docSyncCheckedAt: new Date() })
      .where(eq(t.repos.id, repoId));
  }

  async setClaims(
    repoId: string,
    patch: Partial<Pick<RepoRow, 'docSyncPrClaims' | 'docSyncDismissed'>>,
  ): Promise<void> {
    await this.db.update(t.repos).set(patch).where(eq(t.repos.id, repoId));
  }

  async markBranchSha(repoId: string, sha: string): Promise<void> {
    await this.db.update(t.repos).set({ docSyncBranchSha: sha }).where(eq(t.repos.id, repoId));
  }

  // ---- runs -------------------------------------------------------------

  async runningRun(workspaceId: string): Promise<RunRow | null> {
    const [row] = await this.db
      .select()
      .from(t.docSyncRuns)
      .where(and(eq(t.docSyncRuns.workspaceId, workspaceId), eq(t.docSyncRuns.status, 'running')))
      .limit(1);
    return row ?? null;
  }

  async createRun(workspaceId: string, trigger: RunRow['trigger'], repoIds: string[]): Promise<RunRow> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx.insert(t.docSyncRuns).values({ workspaceId, trigger }).returning();
      await tx.insert(t.docSyncRepoResults).values(repoIds.map((repoId) => ({ runId: run!.id, repoId })));
      return run!;
    });
  }

  async saveResult(
    runId: string,
    repoId: string,
    patch: Pick<ResultRow, 'status'> & Partial<Omit<ResultRow, 'id' | 'runId' | 'repoId'>>,
  ): Promise<void> {
    await this.db
      .update(t.docSyncRepoResults)
      .set({ ...patch, finishedAt: new Date() })
      .where(and(eq(t.docSyncRepoResults.runId, runId), eq(t.docSyncRepoResults.repoId, repoId)));
  }

  resultsFor(runIds: string[]): Promise<(ResultRow & { repoFullName: string })[]> {
    if (runIds.length === 0) return Promise.resolve([]);
    return this.db
      .select({ result: t.docSyncRepoResults, repoFullName: t.repos.fullName })
      .from(t.docSyncRepoResults)
      .innerJoin(t.repos, eq(t.repos.id, t.docSyncRepoResults.repoId))
      .where(inArray(t.docSyncRepoResults.runId, runIds))
      .orderBy(t.repos.fullName)
      .then((rows) => rows.map((r) => ({ ...r.result, repoFullName: r.repoFullName })));
  }

  /**
   * Flip a run to its terminal status once no result is pending. Returns the
   * workspace id only to the single caller that performed the flip, so the
   * summary notification is posted exactly once.
   */
  async finishIfComplete(runId: string): Promise<{ workspaceId: string; results: ResultRow[] } | null> {
    const results = await this.db.select().from(t.docSyncRepoResults).where(eq(t.docSyncRepoResults.runId, runId));
    if (results.some((r) => r.status === 'pending')) return null;
    const allFailed = results.length > 0 && results.every((r) => r.status === 'failed');
    const [row] = await this.db
      .update(t.docSyncRuns)
      .set({ status: allFailed ? 'failed' : 'done', finishedAt: new Date() })
      .where(and(eq(t.docSyncRuns.id, runId), eq(t.docSyncRuns.status, 'running')))
      .returning({ workspaceId: t.docSyncRuns.workspaceId });
    return row ? { workspaceId: row.workspaceId, results } : null;
  }

  listRuns(workspaceId: string, limit: number): Promise<RunRow[]> {
    return this.db
      .select()
      .from(t.docSyncRuns)
      .where(eq(t.docSyncRuns.workspaceId, workspaceId))
      .orderBy(desc(t.docSyncRuns.startedAt))
      .limit(limit);
  }

  async getRun(workspaceId: string, runId: string): Promise<RunRow | null> {
    const [row] = await this.db
      .select()
      .from(t.docSyncRuns)
      .where(and(eq(t.docSyncRuns.workspaceId, workspaceId), eq(t.docSyncRuns.id, runId)));
    return row ?? null;
  }

  /** Boot: runs left `running` by a dead process → failed (AC-9). */
  async reapRunning(): Promise<number> {
    const runs = await this.db
      .update(t.docSyncRuns)
      .set({ status: 'failed', error: 'interrupted', finishedAt: new Date() })
      .where(eq(t.docSyncRuns.status, 'running'))
      .returning({ id: t.docSyncRuns.id });
    if (runs.length > 0) {
      await this.db
        .update(t.docSyncRepoResults)
        .set({ status: 'failed', error: 'interrupted', finishedAt: new Date() })
        .where(
          and(
            inArray(
              t.docSyncRepoResults.runId,
              runs.map((r) => r.id),
            ),
            eq(t.docSyncRepoResults.status, 'pending'),
          ),
        );
    }
    return runs.length;
  }

  // ---- clone filesystem -------------------------------------------------

  /** Every file/dir path in the clone (no `.git`/`node_modules`, no symlink descent). */
  async walkClone(root: string): Promise<ClonedTree> {
    const paths = new Set<string>();
    const packageJsons: string[] = [];
    const stack = [''];
    while (stack.length > 0 && paths.size < MAX_WALK_ENTRIES) {
      const rel = stack.pop()!;
      let entries;
      try {
        entries = await readdir(join(root, rel), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (WALK_SKIP_DIRS.has(e.name)) continue;
        const child = rel ? `${rel}/${e.name}` : e.name;
        paths.add(child);
        if (e.isDirectory()) stack.push(child);
        else if (e.name === 'package.json') packageJsons.push(child);
      }
    }
    return { paths, packageJsons };
  }

  /** File text, or null when missing / not a regular file / too large. */
  async readText(root: string, rel: string): Promise<string | null> {
    try {
      const abs = join(root, rel);
      const s = await lstat(abs);
      if (!s.isFile() || s.size > MAX_DOC_BYTES) return null;
      return await readFile(abs, 'utf8');
    } catch {
      return null;
    }
  }
}
