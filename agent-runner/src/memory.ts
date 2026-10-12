import { readFileSync } from 'node:fs';
import path from 'node:path';
import { matchesAnyGlob, type MemoryEntry } from '@devdigest/reviewer-core';

/** Same entry cap the studio applies (SPEC-2026-10-12-memory AC-16). */
const MAX_ENTRIES = 20;

const KINDS = new Set(['decision', 'convention', 'preference', 'fact', 'learning']);

interface MemoryLine {
  kind?: unknown;
  content?: unknown;
  path_globs?: unknown;
  agent_slugs?: unknown;
}

/**
 * Reads the checked-in `.devdigest/memory.jsonl` into the `MemoryEntry[]`
 * shape `reviewPullRequest({ memory })` expects (SPEC-2026-10-12-memory
 * AC-30a). The file is shared by every agent installed in the repo, so each
 * line says which agents it is for (`agent_slugs`, null = all) and where it
 * applies (`path_globs`, empty = anywhere): keep only this agent's lines that
 * match at least one changed file, capped at 20.
 *
 * A legacy line (a JSON string literal, or any non-JSON text) is kept as a
 * `fact`. A missing or empty file yields `[]`. The content is repo data:
 * `assemblePrompt` fences it in `<team-memory>` with fixed usage rules.
 */
export function loadMemory(
  devdigestDir: string,
  opts: { agentSlug: string; changedFiles: string[] },
  readFile: typeof readFileSync = readFileSync,
): MemoryEntry[] {
  let raw: string;
  try {
    raw = readFile(path.join(devdigestDir, 'memory.jsonl'), 'utf8') as unknown as string;
  } catch {
    return [];
  }
  const items: MemoryEntry[] = [];
  for (const line of raw.split('\n')) {
    if (items.length >= MAX_ENTRIES) break;
    const text = line.trim();
    if (!text) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      items.push({ kind: 'fact', content: text });
      continue;
    }
    if (typeof parsed === 'string') {
      items.push({ kind: 'fact', content: parsed });
      continue;
    }
    const m = parsed as MemoryLine;
    if (typeof m?.content !== 'string' || !m.content.trim()) continue;
    const slugs = Array.isArray(m.agent_slugs) ? m.agent_slugs : null;
    if (slugs && !slugs.includes(opts.agentSlug)) continue;
    const globs = Array.isArray(m.path_globs) ? m.path_globs.filter((g): g is string => typeof g === 'string') : [];
    if (globs.length > 0 && !opts.changedFiles.some((f) => matchesAnyGlob(f, globs))) continue;
    const kind = typeof m.kind === 'string' && KINDS.has(m.kind) ? (m.kind as MemoryEntry['kind']) : 'fact';
    items.push({ kind, content: m.content });
  }
  return items;
}
