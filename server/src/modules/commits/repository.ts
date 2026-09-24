import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Commits data-access. Owns reads of `pr_commits` (owned by
 * `modules/pulls/routes.ts`, which deletes+re-inserts on every `GET
 * /pulls/:id`) and the permanent `commit_files` cache table this module owns.
 */

export type PrCommitRow = typeof t.prCommits.$inferSelect;

export class CommitsRepository {
  constructor(private db: Db) {}

  /** A PR's commits, oldest first (so the panel reads top-to-bottom like a log). */
  async listCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId)).orderBy(asc(t.prCommits.committedAt));
  }

  /** Cached file paths for a set of shas, one query via `inArray`. */
  async getCachedPaths(repoId: string, shas: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (shas.length === 0) return result;
    const rows = await this.db
      .select({ sha: t.commitFiles.sha, path: t.commitFiles.path })
      .from(t.commitFiles)
      .where(and(eq(t.commitFiles.repoId, repoId), inArray(t.commitFiles.sha, shas)));
    for (const row of rows) {
      const list = result.get(row.sha) ?? [];
      list.push(row.path);
      result.set(row.sha, list);
    }
    return result;
  }

  /** Persist a commit's file paths into the permanent cache. Idempotent. */
  async cachePaths(repoId: string, sha: string, paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.db
      .insert(t.commitFiles)
      .values(paths.map((path) => ({ repoId, sha, path })))
      .onConflictDoNothing();
  }
}
