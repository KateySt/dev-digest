import { z } from 'zod';
import type { PrMeta } from '@devdigest/shared';
import { PageQuery } from '../_shared/paging.js';

/**
 * Server-side filter / sort / counts for the PR list (plan 2026-10-19, PR
 * list on the server). Status is derived per request (it depends on "now" and
 * the last reviewed sha) and blast size comes from the blast cache, so the
 * order is applied to the enriched rows rather than in SQL; only the
 * requested page goes back to the studio.
 */

export const PULL_STATUS_FILTERS = ['all', 'needs_review', 'reviewed', 'stale'] as const;
export const PULL_SORTS = ['newest', 'oldest', 'highest_risk'] as const;

export const PullsQuery = PageQuery.extend({
  status: z.enum(PULL_STATUS_FILTERS).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(PULL_SORTS).optional(),
  /** `1` forces a GitHub sync now instead of waiting for the throttle. */
  sync: z.enum(['0', '1']).optional(),
});
export type PullsQuery = z.infer<typeof PullsQuery>;

/** Size buckets — same thresholds as the studio's S/M/L badge. */
const SIZE_SMALL_MAX = 100;
const SIZE_MEDIUM_MAX = 400;
const OPEN_STATUSES = new Set(['needs_review', 'reviewed', 'stale']);

function riskBucket(pr: Pick<PrMeta, 'additions' | 'deletions'>): number {
  const lines = pr.additions + pr.deletions;
  return lines < SIZE_SMALL_MAX ? 0 : lines < SIZE_MEDIUM_MAX ? 1 : 2;
}

/**
 * SPEC-05 C-AC-6..9 — "Highest risk": the riskier size bucket (L > M > S)
 * first; within a bucket, larger cached blast size first, then lower score
 * first. A PR missing blast size or score is never treated as zero — that
 * tiebreak level is skipped for the pair. (Moved here from the studio so the
 * order is defined once.)
 */
export function compareByRisk(a: PrMeta, b: PrMeta): number {
  const bucketDiff = riskBucket(b) - riskBucket(a);
  if (bucketDiff !== 0) return bucketDiff;
  const blastA = a.blast_size ?? null;
  const blastB = b.blast_size ?? null;
  if (blastA != null && blastB != null && blastA !== blastB) return blastB - blastA;
  const scoreA = a.score ?? null;
  const scoreB = b.score ?? null;
  if (scoreA != null && scoreB != null && scoreA !== scoreB) return scoreA - scoreB;
  return 0;
}

const updatedAt = (p: PrMeta) => Date.parse(p.updated_at ?? '') || 0;

/** Filter by status chip and search (title or number), then sort; `number` breaks ties so pages are stable. */
export function filterAndSortPulls(items: PrMeta[], q: Pick<PullsQuery, 'status' | 'q' | 'sort'>): PrMeta[] {
  const status = q.status ?? 'needs_review';
  const search = q.q?.trim().toLowerCase() ?? '';
  const sort = q.sort ?? 'newest';
  return items
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => !search || p.title.toLowerCase().includes(search) || String(p.number).includes(search))
    .sort((a, b) => {
      const primary =
        sort === 'highest_risk'
          ? compareByRisk(a, b)
          : sort === 'oldest'
            ? updatedAt(a) - updatedAt(b)
            : updatedAt(b) - updatedAt(a);
      return primary !== 0 ? primary : b.number - a.number;
    });
}

/** Per-status counts over the whole (unfiltered) list — for the chips and the header summary. */
export function pullCounts(items: PrMeta[]) {
  const counts = { all: items.length, open: 0, needs_review: 0, reviewed: 0, stale: 0 };
  for (const p of items) {
    if (OPEN_STATUSES.has(p.status)) counts.open += 1;
    if (p.status === 'needs_review' || p.status === 'reviewed' || p.status === 'stale') counts[p.status] += 1;
  }
  return counts;
}

/** GitHub sync throttle: the list read only re-syncs a repo this often (paging must not hit GitHub). */
export const PULLS_SYNC_TTL_MS = 60_000;
const lastSyncAt = new Map<string, number>();

/** The next PR-list read syncs with GitHub regardless of the throttle (Refresh button). */
export function resetSyncThrottle(repoId: string): void {
  lastSyncAt.delete(repoId);
}

export function shouldSync(repoId: string, force: boolean, now = Date.now()): boolean {
  const last = lastSyncAt.get(repoId);
  if (!force && last !== undefined && now - last < PULLS_SYNC_TTL_MS) return false;
  lastSyncAt.set(repoId, now);
  return true;
}
