import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
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
}

export interface UpdateSkill extends ScanResultFields {
  name?: string;
  description?: string;
  type?: 'rubric' | 'convention' | 'security' | 'custom';
  body?: string;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Delete a skill (scoped to workspace). skill_versions and agent_skills
   *  links cascade. Returns false if no such skill existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
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
}
