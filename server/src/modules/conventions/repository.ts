import { and, eq, inArray, ne, type SQL } from 'drizzle-orm';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { Db, DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns the `conventions` table (repo-scoped
 * candidates surfaced by `ConventionsService.extract`). Workspace-scoped
 * throughout.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;

/** A convention plus the skill it was merged into (left join; null = unused). */
export type ConventionWithSkill = ConventionRow & {
  skill: { id: string; name: string; repoId: string | null } | null;
};

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: ConventionCategory;
  rule: string;
  rationale: string | null;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceLine: number | null;
  confidence: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionWithSkill[]> {
    return this.selectWithSkill(
      and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)),
    );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionWithSkill | undefined> {
    const [row] = await this.selectWithSkill(
      and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)),
    );
    return row;
  }

  /** Rows for the given ids within the workspace (any repo), optionally
   *  locked `FOR UPDATE` inside the caller's transaction. Used by the
   *  create-skill-from-conventions availability check (AC-5/AC-6). */
  async getManyForSkill(
    workspaceId: string,
    ids: string[],
    executor: DbExecutor = this.db,
    lock = false,
  ): Promise<ConventionRow[]> {
    const q = executor
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
    return lock ? q.for('update') : q;
  }

  /** Link the given conventions to a skill. Caller has already checked (under
   *  lock) that each is accepted, unlinked, and in the right repo. */
  async linkToSkill(ids: string[], skillId: string, executor: DbExecutor = this.db): Promise<void> {
    await executor.update(t.conventions).set({ skillId }).where(inArray(t.conventions.id, ids));
  }

  async unlink(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .update(t.conventions)
      .set({ skillId: null })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning({ id: t.conventions.id });
    return rows.length > 0;
  }

  private async selectWithSkill(where: SQL | undefined): Promise<ConventionWithSkill[]> {
    const rows = await this.db
      .select({
        convention: t.conventions,
        skillId: t.skills.id,
        skillName: t.skills.name,
        skillRepoId: t.skills.repoId,
      })
      .from(t.conventions)
      .leftJoin(t.skills, eq(t.skills.id, t.conventions.skillId))
      .where(where);
    return rows.map((r) => ({
      ...r.convention,
      skill: r.skillId ? { id: r.skillId, name: r.skillName!, repoId: r.skillRepoId } : null,
    }));
  }

  async insertMany(rows: InsertConvention[]): Promise<ConventionRow[]> {
    if (rows.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          repoId: r.repoId,
          category: r.category,
          rule: r.rule,
          rationale: r.rationale,
          evidencePath: r.evidencePath,
          evidenceSnippet: r.evidenceSnippet,
          evidenceLine: r.evidenceLine,
          confidence: r.confidence,
          status: 'pending' as const,
        })),
      )
      .returning();
  }

  /** Drop every NOT-accepted candidate (pending or rejected) for a repo —
   *  called right before a re-scan inserts fresh ones, so accepted decisions
   *  survive a re-scan. */
  async deleteNotAccepted(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'accepted'),
        ),
      );
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: ConventionStatus,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ status })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async updateRule(workspaceId: string, id: string, rule: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ rule })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
