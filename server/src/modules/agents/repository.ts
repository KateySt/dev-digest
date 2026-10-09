import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';
import { DEFAULT_AGENT_DESCRIPTION, INITIAL_AGENT_VERSION } from './constants.js';
import { isConfigChange, sameOrderedIds } from './helpers.js';

/**
 * A2 — agents data-access. Owns `agents`, `agent_versions`, and the
 * `agent_skills` link table (shared with A1's skills repository, but A2 owns the
 * agent side: link/reorder/list for an agent). Workspace-scoped throughout.
 */

import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
export type { AgentRow, AgentVersionRow };

export interface InsertAgent {
  workspaceId: string;
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateAgent {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
  enabled?: boolean;
}

/** A skill linked to an agent (with its order), joined from agent_skills. */
export interface LinkedSkillRow {
  skill: typeof t.skills.$inferSelect;
  order: number;
}

/** A skill as recorded in an `agent_versions` snapshot. */
export interface SnapshotSkillRef {
  id: string;
  version: number;
  name: string;
}

/** Either the root db handle or a transaction handle. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

/** Config applied by "Promote vN" (everything else on the agent is untouched). */
export interface PromoteConfig {
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy;
}

export class AgentsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<AgentRow[]> {
    return this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
  }

  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /** Delete an agent (scoped to workspace). Versions/skill-links/suite runs
   *  cascade; agent_runs keep their history with agent_id set null. The
   *  agent's own eval cases (`owner_id` has no FK) are deleted in the same
   *  transaction. Returns false if no such agent existed in the workspace. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
        .returning({ id: t.agents.id });
      if (rows.length === 0) return false;
      await tx
        .delete(t.evalCases)
        .where(
          and(
            eq(t.evalCases.workspaceId, workspaceId),
            eq(t.evalCases.ownerKind, 'agent'),
            eq(t.evalCases.ownerId, id),
          ),
        );
      return true;
    });
  }

  /** Insert an agent AND record version 1 in agent_versions (immutable snapshot). */
  async insert(values: InsertAgent): Promise<AgentRow> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: values.provider,
        model: values.model,
        systemPrompt: values.systemPrompt,
        outputSchema: (values.outputSchema as object | undefined) ?? null,
        ...(values.strategy !== undefined ? { strategy: values.strategy } : {}),
        ...(values.ciFailOn !== undefined ? { ciFailOn: values.ciFailOn } : {}),
        ...(values.repoIntel !== undefined ? { repoIntel: values.repoIntel } : {}),
        enabled: values.enabled ?? true,
        version: INITIAL_AGENT_VERSION,
        createdBy: values.createdBy ?? null,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_AGENT_VERSION);
    return row!;
  }

  /**
   * Update an agent. Any config change bumps the version and snapshots the new
   * config into agent_versions (reproducibility for eval).
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateAgent,
  ): Promise<AgentRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    // A config-affecting change (anything except just toggling enabled) bumps version.
    const configChanged = isConfigChange(existing, patch);
    const nextVersion = configChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.agents)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
        ...(patch.outputSchema !== undefined
          ? { outputSchema: patch.outputSchema as object }
          : {}),
        ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
        ...(patch.ciFailOn !== undefined ? { ciFailOn: patch.ciFailOn } : {}),
        ...(patch.repoIntel !== undefined ? { repoIntel: patch.repoIntel } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(configChanged ? { version: nextVersion } : {}),
      })
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();

    if (configChanged && row) await this.snapshotVersion(row, nextVersion);
    return row;
  }

  /** Store an immutable snapshot of `row`'s config + currently linked skills
   *  (each with its own version at this moment). Idempotent per version. */
  async snapshotVersion(row: AgentRow, version: number, ex: Executor = this.db): Promise<void> {
    const skills = await this.linkedSkillRefs(row.id, ex);
    await ex
      .insert(t.agentVersions)
      .values({
        agentId: row.id,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  /** Linked skills as snapshot refs (id + the skill's current version + name), in link order. */
  private async linkedSkillRefs(agentId: string, ex: Executor): Promise<SnapshotSkillRef[]> {
    return ex
      .select({ id: t.skills.id, version: t.skills.version, name: t.skills.name })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
  }

  private async orderedSkillIds(agentId: string, ex: Executor): Promise<string[]> {
    return (await this.linkedSkillRefs(agentId, ex)).map((r) => r.id);
  }

  /**
   * Run a skill-link mutation in ONE transaction; when the ordered id list
   * actually changed, bump the agent version and snapshot it in the same
   * transaction (exactly one new version). The agent row is locked so
   * concurrent link edits can't produce the same version twice.
   */
  private async mutateSkillLinks(agentId: string, mutate: (tx: Tx) => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(t.agents).where(eq(t.agents.id, agentId)).for('update');
      if (!locked) return;
      const before = await this.orderedSkillIds(agentId, tx);
      await mutate(tx);
      const after = await this.orderedSkillIds(agentId, tx);
      if (sameOrderedIds(before, after)) return;
      const nextVersion = locked.version + 1;
      const [row] = await tx
        .update(t.agents)
        .set({ version: nextVersion })
        .where(eq(t.agents.id, agentId))
        .returning();
      await this.snapshotVersion(row!, nextVersion, tx);
    });
  }

  // ---- agent_versions (immutable config snapshots) ------------------------

  /** All config snapshots for an agent, newest version first. */
  async listVersions(agentId: string): Promise<AgentVersionRow[]> {
    return this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
  }

  /** A single config snapshot, or undefined if that version was never recorded. */
  async getVersion(agentId: string, version: number): Promise<AgentVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row;
  }

  // ---- agent_skills link table (A2 owns the agent side) -------------------

  /** Skills linked to an agent, in `order` ascending. */
  async linkedSkills(agentId: string): Promise<LinkedSkillRow[]> {
    const rows = await this.db
      .select({ skill: t.skills, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ skill: r.skill, order: r.order }));
  }

  async skillIdsForAgent(agentId: string): Promise<string[]> {
    const links = await this.linkedSkills(agentId);
    return links.map((l) => l.skill.id);
  }

  /** Agents (in this workspace) that currently have `skillId` linked — the
   *  reverse of `linkedSkills`. Backs the Skill Editor's Stats tab ("Used By"
   *  / "Agents Using This Skill"). */
  async agentsForSkill(workspaceId: string, skillId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.skillId, skillId)));
    return rows;
  }

  /** Link a skill to an agent at a given order (idempotent: upserts order).
   *  Bumps the agent version only if the ordered skill list changed. */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.mutateSkillLinks(agentId, async (tx) => {
      await tx
        .insert(t.agentSkills)
        .values({ agentId, skillId, order })
        .onConflictDoUpdate({
          target: [t.agentSkills.agentId, t.agentSkills.skillId],
          set: { order },
        });
    });
  }

  async unlinkSkill(agentId: string, skillId: string): Promise<void> {
    await this.mutateSkillLinks(agentId, async (tx) => {
      await tx
        .delete(t.agentSkills)
        .where(and(eq(t.agentSkills.agentId, agentId), eq(t.agentSkills.skillId, skillId)));
    });
  }

  /**
   * Replace the full set of linked skills for an agent with `skillIds`, assigning
   * order = index. Used by the "Skills" editor tab (attach/reorder). Skills not in
   * the list are unlinked. Bumps the version only if the ordered list changed.
   */
  async setSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.mutateSkillLinks(agentId, async (tx) => {
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (skillIds.length === 0) return;
      await tx
        .insert(t.agentSkills)
        .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
    });
  }

  /** Which of `ids` still exist as skills in this workspace. */
  async existingSkillIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, ids)));
    return new Set(rows.map((r) => r.id));
  }

  /**
   * "Promote vN": apply the snapshot's provider/model/prompt/strategy and the
   * ordered skill links (`skillIds`, all verified to exist) as the agent's
   * current config, stored as a NEW version (current max + 1) - all in one
   * transaction. Returns the updated agent row.
   */
  async applyAsNewVersion(
    agentId: string,
    config: PromoteConfig,
    skillIds: string[],
  ): Promise<AgentRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(t.agents).where(eq(t.agents.id, agentId)).for('update');
      if (!locked) return undefined;
      const [top] = await tx
        .select({ v: max(t.agentVersions.version) })
        .from(t.agentVersions)
        .where(eq(t.agentVersions.agentId, agentId));
      const nextVersion = Math.max(top?.v ?? 0, locked.version) + 1;
      await tx.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
      if (skillIds.length > 0) {
        await tx
          .insert(t.agentSkills)
          .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
      }
      const [row] = await tx
        .update(t.agents)
        .set({
          provider: config.provider,
          model: config.model,
          systemPrompt: config.systemPrompt,
          strategy: config.strategy,
          version: nextVersion,
        })
        .where(eq(t.agents.id, agentId))
        .returning();
      await this.snapshotVersion(row!, nextVersion, tx);
      return row;
    });
  }
}
