import { and, eq, inArray, sql } from 'drizzle-orm';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { EXCLUDED_DIRS, MAX_DOCUMENT_BYTES } from './constants.js';
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

/** Outcome of one document read. `missing` covers nonexistent, non-file,
 *  symlink, and escapes-the-clone alike (AC-30: refused ⇒ "nonexistent"). */
export type ReadDocumentResult =
  | { kind: 'ok'; content: string }
  | { kind: 'missing' }
  | { kind: 'too_large'; size: number };

export type WriteDocumentResult = { ok: true } | { ok: false };

/** `O_NOFOLLOW` exists on POSIX only; on Windows it is undefined and the
 *  explicit `lstat` + real-path checks carry the policy instead. */
const O_NOFOLLOW: number = (fsConstants as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;

/** `isWithinRoot` is false for the root itself; for a DIRECTORY check
 *  (nearest ancestor / parent) the root is a valid answer. */
function isRootOrInside(realRoot: string, realDir: string): boolean {
  return realDir === realRoot || isWithinRoot(realRoot, realDir);
}

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
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

  /** Replace the whole set (AC-9) in ONE transaction, serialized per agent
   *  (S-AC-38/39): concurrent replaces queue on a transaction-scoped advisory
   *  lock, and a failure partway rolls back to the previous set. */
  async setAgentDocuments(agentId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent-context:${agentId}`}, 0))`);
      await tx.delete(t.agentContextDocuments).where(eq(t.agentContextDocuments.agentId, agentId));
      if (paths.length === 0) return;
      await tx.insert(t.agentContextDocuments).values(paths.map((path, order) => ({ agentId, path, order })));
    });
  }

  async listSkillDocuments(skillId: string): Promise<{ path: string; order: number }[]> {
    return this.db
      .select({ path: t.skillContextDocuments.path, order: t.skillContextDocuments.order })
      .from(t.skillContextDocuments)
      .where(eq(t.skillContextDocuments.skillId, skillId));
  }

  /** Replace the whole set (AC-10) — same atomic, per-skill-serialized shape
   *  as {@link setAgentDocuments}. */
  async setSkillDocuments(skillId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`skill-context:${skillId}`}, 0))`);
      await tx.delete(t.skillContextDocuments).where(eq(t.skillContextDocuments.skillId, skillId));
      if (paths.length === 0) return;
      await tx.insert(t.skillContextDocuments).values(paths.map((path, order) => ({ skillId, path, order })));
    });
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
   * Read one document's content (AC-16, AC-30, AC-32, AC-34).
   * SECURITY: this is the one place bytes leave the clone, so it trusts
   * nothing about its input. Policy is "no symlinks" — the target itself must
   * not be a symlink (`lstat`), and the REAL path of the target must stay
   * inside the REAL path of the root (catches symlinked/junctioned parent
   * directories). Size is checked with `stat` BEFORE any content is read, and
   * re-checked on the open handle (TOCTOU). On POSIX the open also passes
   * `O_NOFOLLOW`. Never throws — every refusal is `missing`.
   */
  async readDocument(clonePath: string, relPath: string): Promise<ReadDocumentResult> {
    const missing: ReadDocumentResult = { kind: 'missing' };
    try {
      const root = resolve(clonePath);
      const target = resolve(root, relPath);
      if (!isWithinRoot(root, target)) return missing;

      const realRoot = await realpath(root);
      const link = await lstat(target);
      if (link.isSymbolicLink() || !link.isFile()) return missing;

      const realTarget = await realpath(target);
      if (!isWithinRoot(realRoot, realTarget)) return missing;

      if (link.size > MAX_DOCUMENT_BYTES) return { kind: 'too_large', size: link.size };

      const fh = await open(realTarget, fsConstants.O_RDONLY | O_NOFOLLOW);
      try {
        const st = await fh.stat();
        if (!st.isFile()) return missing;
        if (st.size > MAX_DOCUMENT_BYTES) return { kind: 'too_large', size: st.size };
        return { kind: 'ok', content: await fh.readFile('utf8') };
      } finally {
        await fh.close();
      }
    } catch {
      return missing;
    }
  }

  /**
   * Write a document into the clone working tree — NO git add/commit/push
   * (design decision in the spec). Creates the parent directory when it
   * doesn't exist yet (AC-26). The caller (service) has already validated
   * `relPath` shape and content size; this method enforces the filesystem
   * half (AC-25, AC-31): string containment, then the REAL path of the
   * nearest existing ancestor must be inside the REAL clone root BEFORE any
   * `mkdir` (so a symlinked/junctioned ancestor creates nothing outside),
   * re-checked after `mkdir`; an existing symlink target is refused; the
   * file is opened with `O_NOFOLLOW` on POSIX (Windows relies on the `lstat`
   * check, which has no atomic equivalent).
   */
  async writeDocument(clonePath: string, relPath: string, content: string): Promise<WriteDocumentResult> {
    const refused: WriteDocumentResult = { ok: false };
    const root = resolve(clonePath);
    const target = resolve(root, relPath);
    if (!isWithinRoot(root, target)) return refused;

    const realRoot = await realpath(root).catch(() => null);
    if (realRoot == null) return refused;
    const parent = dirname(target);

    // Nearest existing ancestor, by real path, before creating anything.
    let ancestor = parent;
    for (;;) {
      try {
        await lstat(ancestor);
        break;
      } catch (err) {
        if (!isEnoent(err)) return refused;
        const up = dirname(ancestor);
        if (up === ancestor) return refused;
        ancestor = up;
      }
    }
    // A dangling symlink as ancestor makes realpath throw → refused below.
    const realAncestor = await realpath(ancestor).catch(() => null);
    if (realAncestor == null || !isRootOrInside(realRoot, realAncestor)) return refused;

    try {
      await mkdir(parent, { recursive: true });
    } catch (err) {
      // An ancestor that is a regular file (EEXIST/ENOTDIR) is a bad path, not a server fault.
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST' || code === 'ENOTDIR') return refused;
      throw err;
    }
    const realParent = await realpath(parent).catch(() => null);
    if (realParent == null || !isRootOrInside(realRoot, realParent)) return refused;

    try {
      const existing = await lstat(target);
      if (existing.isSymbolicLink() || !existing.isFile()) return refused;
    } catch (err) {
      if (!isEnoent(err)) return refused;
    }

    const fh = await open(
      target,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | O_NOFOLLOW,
      0o644,
    );
    try {
      await fh.writeFile(content, 'utf8');
    } finally {
      await fh.close();
    }
    return { ok: true };
  }
}
