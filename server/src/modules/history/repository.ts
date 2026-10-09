import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * PR-history data-access. Owns the read for "prior PRs touching these files":
 * a join of `pull_requests` ⨝ `pr_files`, filtered to merged/closed PRs in
 * the same repo (excluding the current PR itself) whose files overlap the
 * current PR's changed paths. No caching, no owned table (unlike
 * `BlastRepository`/`CommitsRepository`) — see `HistoryService`'s doc comment
 * for why a live read is simpler and more correct here.
 */

/** One (PR, overlapping file) pair — the join's raw row shape. Multiple rows
 *  share the same PR when it overlaps on more than one file; `helpers.ts#groupOverlapsByPr`
 *  collapses them back into one entry per PR. */
export interface OverlapRow {
  id: string;
  number: number;
  title: string;
  author: string;
  updatedAt: Date | null;
  openedAt: Date | null;
  path: string;
}

export class HistoryRepository {
  constructor(private db: Db) {}

  /**
   * Merged/closed PRs (in `repoId`, excluding `excludePrId`) that touched any
   * of `paths`, most-recently-updated first, capped to the `limit` most
   * relevant DISTINCT PRs.
   *
   * The cap is applied in-memory over the full (unlimited) join result,
   * rather than as a SQL `LIMIT`, because the join is one row per
   * (PR, overlapping file) pair — a plain `LIMIT` would cap join ROWS, so a
   * single PR that overlaps on many files could crowd out a different,
   * equally-relevant PR from the result. `updatedAt DESC, id` gives a
   * deterministic order (the `id` tie-break also keeps every row for one PR
   * contiguous), so the same top-`limit` PRs are picked every time and every
   * one of their overlapping files is included — not truncated mid-PR.
   */
  async findOverlappingPrs(
    repoId: string,
    excludePrId: string,
    paths: string[],
    limit: number,
  ): Promise<OverlapRow[]> {
    if (paths.length === 0) return [];

    const rows = await this.db
      .select({
        id: t.pullRequests.id,
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        author: t.pullRequests.author,
        updatedAt: t.pullRequests.updatedAt,
        openedAt: t.pullRequests.openedAt,
        path: t.prFiles.path,
      })
      .from(t.pullRequests)
      .innerJoin(t.prFiles, eq(t.prFiles.prId, t.pullRequests.id))
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          ne(t.pullRequests.id, excludePrId),
          inArray(t.pullRequests.status, ['merged', 'closed']),
          inArray(t.prFiles.path, paths),
        ),
      )
      .orderBy(desc(t.pullRequests.updatedAt), t.pullRequests.id);

    const includedIds = new Set<string>();
    for (const row of rows) {
      if (includedIds.size >= limit && !includedIds.has(row.id)) continue;
      includedIds.add(row.id);
    }
    return rows.filter((row) => includedIds.has(row.id));
  }
}
