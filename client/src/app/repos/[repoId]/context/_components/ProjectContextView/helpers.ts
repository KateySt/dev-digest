import { ApiError } from "@/lib/api";
import type { SpecFile } from "@/lib/types";

/** Compact "N ago" duration — deliberately simple (unit letters, not a full
 *  localized sentence) since the footer just needs an at-a-glance age, same
 *  spirit as the token-count badges elsewhere on this page. */
export function formatAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/** Footer token total (C-AC-1) — always the heuristic estimate: this page's
 *  document list is never scoped to a model (Open question 2, server
 *  `project-context.md`), so every contributing count is already marked
 *  `estimated` by the server. */
export function footerTokenTotal(documents: SpecFile[]): number {
  return documents.reduce((sum, d) => sum + (d.tokens ?? 0), 0);
}

/** "Add folder" (C-AC-6) builds ONE repo-relative path from a folder name +
 *  a first document name, appending `.md` when the user left it off. */
export function buildDocumentPath(folder: string, document: string): string {
  const cleanFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  let name = document.trim().replace(/^\/+/, "");
  if (!name.toLowerCase().endsWith(".md")) name = `${name}.md`;
  return cleanFolder ? `${cleanFolder}/${name}` : name;
}

/** A minimal starter body for a newly created document, titled from its
 *  filename, so "add folder" never creates a zero-byte file. */
export function defaultDocumentContent(document: string): string {
  const base = document.replace(/\.md$/i, "").trim();
  const title = base.length > 0 ? base : "Untitled";
  return `# ${title}\n`;
}

/** Upload target: the currently selected document's folder, so an upload
 *  never needs its own folder prompt. Falls back to the repo root when
 *  nothing is selected — the server's existing AC-24 validation (must live
 *  under specs/, docs/, or insights/) surfaces as the normal inline error in
 *  that case, so this needs no separate empty-selection handling. */
export function uploadTargetPath(selectedPath: string | null, fileName: string): string {
  const slash = selectedPath?.lastIndexOf("/") ?? -1;
  const folder = slash > 0 ? selectedPath!.slice(0, slash) : "";
  return folder ? `${folder}/${fileName}` : fileName;
}

const BLOCKED_REASON_PREFIX = "project_context_blocked:";

/** Parse repo-intel's resync `reason` for S-AC-28's refusal (C-AC-9) — see
 *  `server/src/modules/repo-intel/service.ts`'s `resyncRepo`. Returns `[]`
 *  for every other reason (no_clone, sync_failed:…, sha_unchanged, …). */
export function parseBlockedPaths(reason: string | null | undefined): string[] {
  if (!reason || !reason.startsWith(BLOCKED_REASON_PREFIX)) return [];
  return reason
    .slice(BLOCKED_REASON_PREFIX.length)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Error code the server's synchronous resync refusal carries (S-AC-35). */
export const BLOCKED_ERROR_CODE = "project_context_blocked";

/** C-AC-29: blocking paths from a 409 `project_context_blocked` ApiError's
 *  `details.paths`; `null` when the error is anything else. */
export function blockedPathsFromError(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.status !== 409 || err.code !== BLOCKED_ERROR_CODE) return null;
  const paths = (err.details as { paths?: unknown } | undefined)?.paths;
  return Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : [];
}
