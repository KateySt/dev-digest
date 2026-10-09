import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { isBodyChange } from './helpers.js';

/**
 * A1 — skills data-access. Owns `skills` and `skill_versions`. Does NOT own
 * `agent_skills` (the agents module owns the agent-side link/reorder — see
 * `modules/agents/repository.ts`'s `linkedSkills`/`setSkills`). Workspace-
 * scoped throughout.
 */

import type { AgentRunRow, SkillRow, SkillVersionRow } from '../../db/rows.js';
export type { SkillRow, SkillVersionRow };

/** A finding's category/outcome joined to the review it belongs to — the raw
 *  material for the Stats tab's accept-rate / findings-by-category / 30d
 *  count. Scoped to a set of agent ids (the agents currently using a skill —
 *  see `SkillsRepository.findingOutcomesForAgents`'s doc comment for why
 *  there's no direct finding→skill attribution). */
export interface SkillFindingOutcomeRow {
  /** The agent that produced this finding (via its review) — used by the
   *  list-level batched usage summary to attribute a finding back to the
   *  agent's linked skills. Not needed by the single-skill Stats tab query
   *  (already pre-filtered to one skill's agents), but harmless there too. */
  agentId: string | null;
  category: string;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
  reviewCreatedAt: Date;
}

/** One `agent_skills` link, workspace-scoped via the agent side. Backs the
 *  Skills list's batched usage summary (see `computeSkillUsageSummaries`). */
export interface AgentSkillLinkRow {
  skillId: string;
  agentId: string;
}

/** Content-scan result fields, shared by insert (initial scan) and update
 *  (re-scan on body change, or a standalone re-scan). See
 *  `helpers.ts`'s `isScanBlocking` for how these gate enabling/serving. */
export interface ScanResultFields {
  scanStatus?: 'pending' | 'clean' | 'flagged' | 'error';
  scanFindings?: unknown[] | null;
  scannedAt?: Date | null;
}

export interface InsertSkill extends ScanResultFields {
  workspaceId: string;
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[];
  /** Project scope (SPEC-07). Absent/undefined ⇒ global (null repo_id). */
  repoId?: string | null;
  /** Catalog tag slugs (SPEC-07). Absent/undefined ⇒ null (no tags). */
  tags?: string[] | null;
  /** Repo-relative catalog path a community import came from (SPEC-07
   *  S-AC-28 gap-fill). Absent/undefined ⇒ null (manual/imported_url skills,
   *  and community skills imported before this column existed). */
  sourcePath?: string | null;
}

export interface UpdateSkill extends ScanResultFields {
  name?: string;
  description?: string;
  type?: 'rubric' | 'convention' | 'security' | 'custom';
  body?: string;
  enabled?: boolean;
  /** Project scope reassignment (2026-10-02 amendment, AC-41/AC-43).
   *  `undefined` ⇒ not touched; `null` ⇒ cleared to global; a string ⇒
   *  reassigned to that repo. Never affects `version`/scan fields (AC-44). */
  repoId?: string | null;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /**
   * List a workspace's skills, optionally narrowed by project scope
   * (2026-10-02 amendment). `repoFilter`:
   *  - `undefined` ⇒ no filter, every skill regardless of `repo_id` (AC-36,
   *    the default — also what the Agent editor's skill picker always gets,
   *    AC-40).
   *  - `null` ⇒ global-only: `repo_id IS NULL` (AC-37).
   *  - a repo id ⇒ that project's skills plus every global skill (AC-35).
   */
  async list(workspaceId: string, repoFilter?: string | null): Promise<SkillRow[]> {
    if (repoFilter === undefined) {
      return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    }
    if (repoFilter === null) {
      return this.db
        .select()
        .from(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), isNull(t.skills.repoId)));
    }
    return this.db
      .select()
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          or(isNull(t.skills.repoId), eq(t.skills.repoId, repoFilter)),
        ),
      );
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). skill_versions, agent_skills links and
   *  eval_suite_runs (+ their per-case results) cascade via FK. `eval_cases` (owned
   *  by the eval module, no FK on `owner_id`) is cleaned up by the caller in the same
   *  transaction - pass its `tx` as `executor`. Returns false if no such skill existed. */
  async deleteById(workspaceId: string, id: string, executor: DbExecutor = this.db): Promise<boolean> {
    const rows = await executor
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /** Insert a skill AND record version 1 in skill_versions. */
  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type,
        source: values.source,
        body: values.body,
        enabled: values.enabled ?? true,
        version: INITIAL_SKILL_VERSION,
        evidenceFiles: values.evidenceFiles ?? null,
        ...(values.scanStatus !== undefined ? { scanStatus: values.scanStatus } : {}),
        scanFindings: values.scanFindings ?? null,
        scannedAt: values.scannedAt ?? null,
        repoId: values.repoId ?? null,
        tags: values.tags ?? null,
        sourcePath: values.sourcePath ?? null,
      })
      .returning();
    await this.snapshotVersion(row!.id, INITIAL_SKILL_VERSION, row!.body);
    return row!;
  }

  /**
   * Update a skill. A `body` change bumps the version and snapshots the new
   * body into skill_versions (reproducibility); cosmetic-only edits (name,
   * description, type, enabled) do not.
   */
  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = isBodyChange(existing, patch);
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.repoId !== undefined ? { repoId: patch.repoId } : {}),
        ...(bodyChanged ? { version: nextVersion } : {}),
        ...(patch.scanStatus !== undefined ? { scanStatus: patch.scanStatus } : {}),
        ...(patch.scanFindings !== undefined ? { scanFindings: patch.scanFindings } : {}),
        ...(patch.scannedAt !== undefined ? { scannedAt: patch.scannedAt } : {}),
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) await this.snapshotVersion(row.id, nextVersion, row.body);
    return row;
  }

  private async snapshotVersion(skillId: string, version: number, body: string): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId, version, body })
      .onConflictDoNothing();
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** All body snapshots for a skill, newest version first. Backs the
   *  Versions tab's history list + Diff/Restore. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  // ---- Stats tab aggregation ------------------------------------------------
  // Findings have no skill_id column — a finding can't be attributed to the
  // specific skill that caused it. These two reads approximate a skill's
  // usage stats from every agent that currently has it linked (agent_skills),
  // same approach as `agent-performance`'s per-agent aggregation, just
  // pre-filtered to a set of agent ids instead of one agent.

  /** Every agent_runs row for a set of agents (empty array ⇒ empty result). */
  async runsForAgents(workspaceId: string, agentIds: string[]): Promise<AgentRunRow[]> {
    if (agentIds.length === 0) return [];
    return this.db
      .select()
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.agentRuns.agentId, agentIds)));
  }

  /** Findings' category + accept/dismiss outcome + review timestamp, for a
   *  set of agents (joined via reviews, same path as agent-performance). */
  async findingOutcomesForAgents(workspaceId: string, agentIds: string[]): Promise<SkillFindingOutcomeRow[]> {
    if (agentIds.length === 0) return [];
    return this.db
      .select({
        agentId: t.reviews.agentId,
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
        dismissedAt: t.findings.dismissedAt,
        reviewCreatedAt: t.reviews.createdAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.agentId, agentIds)));
  }

  /** Every agent_skills link in the workspace (scoped via the agent side —
   *  agent_skills itself has no workspaceId column). Backs the Skills list's
   *  batched per-card usage summary (avoids one stats query per skill). */
  async agentSkillLinksForWorkspace(workspaceId: string): Promise<AgentSkillLinkRow[]> {
    return this.db
      .select({ skillId: t.agentSkills.skillId, agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
  }

  /**
   * Catalog paths already imported into a specific project — feeds
   * suggestion exclusion (SPEC-07 S-AC-28). Matches on the stored
   * `source_path` column exactly (the repo-relative catalog path a
   * community import came from), not the earlier `(name, folder-tag)` proxy
   * — exact path matching survives a later rename in the Skill Editor and
   * can't collide across folders. A null `source_path` (skills imported
   * before this column existed) simply never matches any catalog entry's
   * path, so those rows fall out of the exclusion set — acceptable per the
   * same zero-backfill discipline as AC-34.
   */
  async communitySkillSourcePathsForRepo(workspaceId: string, repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ sourcePath: t.skills.sourcePath })
      .from(t.skills)
      .where(
        and(
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.repoId, repoId),
          eq(t.skills.source, 'community'),
        ),
      );
    return rows.map((r) => r.sourcePath).filter((p): p is string => p !== null);
  }
}
