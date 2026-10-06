import { eq, inArray } from 'drizzle-orm';
import type { BlastRadius } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Blast-radius data-access. Owns the `blast` slice of the shared `pr_brief`
 * table (see the `PrBrief` contract comment: "pr_brief.json" is meant to hold
 * Intent/BlastRadius/Risks/PrHistory pieces as they each ship) — reads merge
 * the existing json before writing so a sibling module's slice on the same
 * row doesn't get clobbered. Mirrors `modules/risks/repository.ts` exactly.
 */

export interface BlastSlice {
  blast: BlastRadius;
  /** The head sha this slice was computed against — staleness detection
   *  only, NOT part of the public `BlastRadius` contract. */
  headSha: string;
  /** `repo_index_state.last_indexed_sha` at compute time — staleness
   *  detection for the REPO's index, independent of the PR's head sha (a
   *  resync/reindex doesn't change `pull.headSha` but can change every
   *  downstream caller/endpoint fact). See `BlastService.getOrCompute`. */
  indexedSha: string;
  /** Whether this slice was computed from a degraded repo-intel result.
   *  A degraded slice is never treated as a fresh cache hit (see
   *  `BlastService.getOrCompute`), even when `headSha` still matches. */
  degraded: boolean;
}

interface PrBriefJson {
  blast?: BlastSlice;
  [key: string]: unknown;
}

export class BlastRepository {
  constructor(private db: Db) {}

  async getSlice(prId: string): Promise<BlastSlice | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return (row?.json as PrBriefJson | undefined)?.blast;
  }

  /** Batch, read-only cache lookup for the PR list (SPEC-05 S-AC-17/S-AC-18) —
   *  never computes a missing slice, only returns what's already cached. */
  async getSlices(prIds: string[]): Promise<Map<string, BlastSlice>> {
    if (prIds.length === 0) return new Map();
    const rows = await this.db.select().from(t.prBrief).where(inArray(t.prBrief.prId, prIds));
    const out = new Map<string, BlastSlice>();
    for (const row of rows) {
      const slice = (row.json as PrBriefJson | undefined)?.blast;
      if (slice) out.set(row.prId, slice);
    }
    return out;
  }

  async upsertSlice(prId: string, slice: BlastSlice): Promise<void> {
    const [existing] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    const json: PrBriefJson = { ...(existing?.json as PrBriefJson | undefined), blast: slice };
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
