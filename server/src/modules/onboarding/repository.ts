import { and, eq, inArray, sql } from 'drizzle-orm';
import type { OnboardingTour } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { GENERATE_JOB_KIND } from './constants.js';

/**
 * onboarding data-access — the SOLE Drizzle importer in this module (onion
 * rule, see `server/AGENTS.md`'s per-module layering table). Owns two
 * concerns:
 *   - the `onboarding` table (repo_id PK, json, generated_at) — read +
 *     upsert-in-place, never delete-then-insert (drizzle-orm-patterns).
 *   - an in-flight lookup over the shared `jobs` table — `JobRunner.enqueue()`
 *     has no in-flight detection of its own (confirmed: it unconditionally
 *     inserts a row), so S-AC-3's "don't enqueue a second job" guarantee has
 *     to be built here.
 */

/** Minimal repo shape the service needs: clone path (facts collection +
 *  no-clone detection) and identity (owner/name for git ops, full_name for
 *  `blob_ref` construction on the client side). */
export interface OnboardingRepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  clonePath: string | null;
}

export class OnboardingRepository {
  constructor(private db: Db) {}

  async getRepoBasics(repoId: string): Promise<OnboardingRepoBasics | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row ?? null;
  }

  /** The stored tour's raw JSON blob, or `null` when none exists yet
   *  (S-AC-1 / C-AC-19's not-yet-generated state). */
  async getTourJson(repoId: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId));
    return row ? row.json : null;
  }

  /**
   * Replace the repo's tour in place (S-AC-4 — no previous version
   * retained). PK = repo_id, so this is `INSERT ... ON CONFLICT (repo_id) DO
   * UPDATE`, never delete-then-insert (drizzle-orm-patterns).
   */
  async upsertTour(repoId: string, tour: OnboardingTour): Promise<void> {
    const generatedAt = new Date(tour.generated_at);
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json: tour, generatedAt })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: tour, generatedAt },
      });
  }

  /**
   * The in-flight (queued or running) generation job for this repo, if any
   * — S-AC-3's "don't enqueue a second job, return the in-flight job's id
   * instead." `payload->>'repoId'` matches the plan's exact mechanism;
   * `jobs.payload` has no index on this path, but the jobs table is small
   * and workspace-scoped generation is a low-frequency action, so a plain
   * jsonb text-extraction scan is acceptable here (same trade-off the rest
   * of this module's read paths make).
   */
  async findInFlightJob(repoId: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: t.jobs.id })
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.kind, GENERATE_JOB_KIND),
          inArray(t.jobs.status, ['queued', 'running']),
          sql`${t.jobs.payload} ->> 'repoId' = ${repoId}`,
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
