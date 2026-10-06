import { and, eq, inArray } from 'drizzle-orm';
import { mkdir, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { EXCLUDED_DIRS } from './constants.js';
import { isAllowedDocumentPath, isWithinRoot } from './helpers.js';

/**
 * SPEC-04 (Project Context) — Ring 2 infrastructure. Unlike most modules'
 * `repository.ts` (Drizzle-only), this module's ports span BOTH the
 * `agent_context_documents` / `skill_context_documents` tables AND the
 * repo clone's filesystem (scan/read/write) — there is no separate adapter
 * budgeted for clone-document I/O (see the Development Plan's Scope note:
 * only two new adapter ports, tokenizer + git-status), so it lives here as
 * this module's own Ring 2 boundary. `service.ts` never imports `fs` or
 * Drizzle directly — only this file does.
 */

export interface RepoCloneRow {
  id: string;
  clonePath: string | null;
}

export interface DiscoveredFile {
  path: string;
  size: number;
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  // ---- repos (read-only lookup; this module doesn't own the repos table) --

  async getRepoClone(workspaceId: string, repoId: string): Promise<RepoCloneRow | null> {
    const [row] = await this.db
      .select({ id: t.repos.id, clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  /** The agent's configured model — for scoping a token-count request to it
   *  (S-AC-5). Null when the agent doesn't exist. */
  async getAgentModel(agentId: string): Promise<string | null> {
    const [row] = await this.db.select({ model: t.agents.model }).from(t.agents).where(eq(t.agents.id, agentId));
    return row?.model ?? null;
  }

  // ---- agent_context_documents / skill_context_documents ------------------

  async listAgentDocuments(agentId: string): Promise<{ path: string; order: number }[]> {
    return this.db
      .select({ path: t.agentContextDocuments.path, order: t.agentContextDocuments.order })
      .from(t.agentContextDocuments)
      .where(eq(t.agentContextDocuments.agentId, agentId));
  }

  /** Replace the whole set (AC-9). */
  async setAgentDocuments(agentId: string, paths: string[]): Promise<void> {
    await this.db.delete(t.agentContextDocuments).where(eq(t.agentContextDocuments.agentId, agentId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.agentContextDocuments)
      .values(paths.map((path, order) => ({ agentId, path, order })));
  }

  async listSkillDocuments(skillId: string): Promise<{ path: string; order: number }[]> {
    return this.db
      .select({ path: t.skillContextDocuments.path, order: t.skillContextDocuments.order })
      .from(t.skillContextDocuments)
      .where(eq(t.skillContextDocuments.skillId, skillId));
  }

  /** Replace the whole set (AC-10). */
  async setSkillDocuments(skillId: string, paths: string[]): Promise<void> {
    await this.db.delete(t.skillContextDocuments).where(eq(t.skillContextDocuments.skillId, skillId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.skillContextDocuments)
      .values(paths.map((path, order) => ({ skillId, path, order })));
  }

  /**
   * An agent's own attached documents plus its LINKED skills (raw —
   * enabled/scan-blocking filtering happens in the service, ring 1). Used
   * both by run resolution (AC-11..14) and coverage math (AC-21, AC-22).
   */
  async linkedSkillsRaw(
    agentId: string,
  ): Promise<{ skillId: string; order: number; enabled: boolean; scanStatus: string; scanFindings: unknown }[]> {
    const rows = await this.db
      .select({
        skillId: t.skills.id,
        order: t.agentSkills.order,
        enabled: t.skills.enabled,
        scanStatus: t.skills.scanStatus,
        scanFindings: t.skills.scanFindings,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId));
    return rows;
  }

  // ---- coverage / used-by raw rows (AC-21, AC-22) --------------------------

  async enabledAgentIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
    return rows.map((r) => r.id);
  }

  async enabledSkillIds(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.enabled, true)));
    return rows.map((r) => r.id);
  }

  async documentsForAgents(agentIds: string[]): Promise<{ agentId: string; path: string }[]> {
    if (agentIds.length === 0) return [];
    return this.db
      .select({ agentId: t.agentContextDocuments.agentId, path: t.agentContextDocuments.path })
      .from(t.agentContextDocuments)
      .where(inArray(t.agentContextDocuments.agentId, agentIds));
  }

  async documentsForSkills(skillIds: string[]): Promise<{ skillId: string; path: string }[]> {
    if (skillIds.length === 0) return [];
    return this.db
      .select({ skillId: t.skillContextDocuments.skillId, path: t.skillContextDocuments.path })
      .from(t.skillContextDocuments)
      .where(inArray(t.skillContextDocuments.skillId, skillIds));
  }

  /** Every agent_skills link for a set of agents (raw — filtering is the
   *  service's job), so coverage can compute each agent's inherited paths
   *  the same way run resolution does. */
  async skillLinksForAgents(
    agentIds: string[],
  ): Promise<{ agentId: string; skillId: string; enabled: boolean; scanStatus: string; scanFindings: unknown }[]> {
    if (agentIds.length === 0) return [];
    return this.db
      .select({
        agentId: t.agentSkills.agentId,
        skillId: t.skills.id,
        enabled: t.skills.enabled,
        scanStatus: t.skills.scanStatus,
        scanFindings: t.skills.scanFindings,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(inArray(t.agentSkills.agentId, agentIds));
  }

  // ---- clone filesystem (scan / read / write) ------------------------------

  /** Recursively walk the clone for every allowlisted `.md` document. Never
   *  throws — an unreadable clone degrades to `[]` (AC-2's degraded path is
   *  decided one level up, by the service checking `clonePath` first). */
  async scanDocuments(clonePath: string): Promise<DiscoveredFile[]> {
    const out: DiscoveredFile[] = [];
    await this.walk(clonePath, '', out);
    return out;
  }

  private async walk(root: string, relDir: string, out: DiscoveredFile[]): Promise<void> {
    const absDir = relDir ? join(root, relDir) : root;
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await this.walk(root, relPath, out);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isAllowedDocumentPath(relPath)) continue;
      try {
        const st = await stat(join(root, relPath));
        out.push({ path: relPath, size: st.size });
      } catch {
        // Raced deletion between readdir and stat — skip, never throw.
      }
    }
  }

  /**
   * Read one document's content, or null when it doesn't exist (AC-16).
   * SECURITY (defense in depth): re-confirms clone-root containment on the
   * RESOLVED absolute path here too (same `isWithinRoot` check
   * `writeDocument` below already applies) so a future caller can't
   * reintroduce a path-traversal read by skipping the service-layer
   * `normalizeRelativePath`/`isAllowedDocumentPath` validation — this is the
   * one place actual bytes leave the clone, so it must not trust its input.
   */
  async readDocument(clonePath: string, relPath: string): Promise<string | null> {
    const root = resolve(clonePath);
    const target = resolve(root, relPath);
    if (!isWithinRoot(root, target)) return null;
    try {
      return await readFile(target, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Write a document into the clone working tree — NO git add/commit/push
   * (design decision in the spec). Creates the parent directory when it
   * doesn't exist yet (AC-26, the "add folder" flow). The caller (service)
   * must have already validated `relPath` with `helpers.normalizeRelativePath`
   * + `isAllowedDocumentPath`; this method additionally re-confirms
   * clone-root containment on the RESOLVED absolute path (AC-25) since that
   * check needs a real path, not just string shape.
   */
  async writeDocument(clonePath: string, relPath: string, content: string): Promise<{ ok: true } | { ok: false }> {
    const root = resolve(clonePath);
    const target = resolve(root, relPath);
    if (!isWithinRoot(root, target)) return { ok: false };
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    return { ok: true };
  }
}
