import type { PrHistoryItem } from '@devdigest/shared';
import type { OverlapRow } from './repository.js';

/**
 * Pure `OverlapRow[]` (repository join rows) → `PrHistoryItem[]` (public
 * contract) mapping. No I/O, no Fastify/Drizzle imports. Mirrors
 * `blast/helpers.ts`'s split: a grouping step (`groupOverlapsByPr`, JS `Map`
 * grouping like `blast/helpers.ts#callersBySymbol`) and a per-row mapper
 * (`toPrHistoryItem`).
 */

/** The subset of a PR row `toPrHistoryItem` needs — deliberately narrower
 *  than the full `OverlapRow` so callers can't accidentally read `path` off
 *  the grouped pull (that's `overlapPaths` instead). */
export type OverlapPull = Pick<OverlapRow, 'id' | 'number' | 'title' | 'author' | 'updatedAt' | 'openedAt'>;

export interface GroupedOverlap {
  pull: OverlapPull;
  overlapPaths: string[];
}

/** Groups join rows by PR, deduping + sorting each PR's overlapping files.
 *  Preserves the repository's `updatedAt DESC` ordering (JS `Map` iterates in
 *  insertion order, and rows for the same PR are contiguous in the input). */
export function groupOverlapsByPr(rows: OverlapRow[]): GroupedOverlap[] {
  const byId = new Map<string, GroupedOverlap>();
  for (const row of rows) {
    const existing = byId.get(row.id);
    if (existing) {
      existing.overlapPaths.push(row.path);
    } else {
      byId.set(row.id, {
        pull: {
          id: row.id,
          number: row.number,
          title: row.title,
          author: row.author,
          updatedAt: row.updatedAt,
          openedAt: row.openedAt,
        },
        overlapPaths: [row.path],
      });
    }
  }
  for (const group of byId.values()) {
    group.overlapPaths = Array.from(new Set(group.overlapPaths)).sort();
  }
  return Array.from(byId.values());
}

/** Deterministic, LLM-free note sentence — matches `blast/helpers.ts#buildSummary`'s
 *  singular/plural idiom. */
export function buildNotes(overlapCount: number): string {
  return `shares ${overlapCount} file${overlapCount === 1 ? '' : 's'} with this PR`;
}

/**
 * One grouped PR → one `PrHistoryItem`, or `null` if it can't be built.
 * `merged_at` approximates the merge time with `updatedAt` (fallback
 * `openedAt`) — no DB migration, no GitHub-adapter change (see the
 * Development Plan). The contract field is non-nullable, so a PR with BOTH
 * timestamps null is dropped entirely rather than fabricating a timestamp.
 */
export function toPrHistoryItem(pull: OverlapPull, overlapPaths: string[]): PrHistoryItem | null {
  const mergedAt = pull.updatedAt ?? pull.openedAt;
  if (!mergedAt) return null;

  return {
    pr_number: pull.number,
    title: pull.title,
    merged_at: mergedAt.toISOString(),
    author: pull.author,
    files_overlap: overlapPaths,
    notes: buildNotes(overlapPaths.length),
  };
}
