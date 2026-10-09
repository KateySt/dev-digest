import { eq } from 'drizzle-orm';
import type { Risk } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Risks data-access. Owns the `risks` slice of the shared `pr_brief` table
 * (see the `PrBrief` contract comment: "pr_brief.json" is meant to hold
 * Intent/BlastRadius/Risks/PrHistory pieces as they each ship) — reads merge
 * the existing json before writing so a future blast-radius/history module
 * landing on the same row doesn't get clobbered.
 */

export interface RisksSlice {
  risks: Risk[];
  /** The head sha this slice was computed against — staleness detection
   *  only, NOT part of the public `Risks` contract. */
  headSha: string;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

interface PrBriefJson {
  risks?: RisksSlice;
  [key: string]: unknown;
}

export class RisksRepository {
  constructor(private db: Db) {}

  async getSlice(prId: string): Promise<RisksSlice | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return (row?.json as PrBriefJson | undefined)?.risks;
  }

  async upsertSlice(prId: string, slice: RisksSlice): Promise<void> {
    const [existing] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    const json: PrBriefJson = { ...(existing?.json as PrBriefJson | undefined), risks: slice };
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}
