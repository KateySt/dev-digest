import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Intent data-access. Owns the `pr_intent` table (the single persistence path
 * for it — see `server/src/modules/reviews/repository/pull.repo.ts`, whose
 * old `upsertIntent`/`getIntent` were dead code and have been removed in
 * favor of this module). Also exposes a couple of read-only helpers against
 * `pr_commits` for the "no real documentation" fallback signal, mirroring how
 * `reviews/repository/pull.repo.ts` already reads `pr_files` for a different
 * feature — not worth a whole new module just for one SELECT.
 */

export type IntentRow = typeof t.prIntent.$inferSelect;

export interface UpsertIntentInput {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  headSha: string;
  confidence: 'high' | 'low';
  sources: string[];
  specRefPath: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

export class IntentRepository {
  constructor(private db: Db) {}

  async getByPrId(prId: string): Promise<IntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row;
  }

  async upsert(input: UpsertIntentInput): Promise<IntentRow> {
    const values = {
      prId: input.prId,
      intent: input.intent,
      inScope: input.inScope,
      outOfScope: input.outOfScope,
      headSha: input.headSha,
      confidence: input.confidence,
      sources: input.sources,
      specRefPath: input.specRefPath,
      provider: input.provider,
      model: input.model,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      costUsd: input.costUsd,
    };
    const [row] = await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: values })
      .returning();
    return row!;
  }

  /** Commit messages for a PR — one of the fallback signals used when the PR
   *  body has no real documentation. */
  async getCommitMessages(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ message: t.prCommits.message })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
    return rows.map((r) => r.message);
  }
}
