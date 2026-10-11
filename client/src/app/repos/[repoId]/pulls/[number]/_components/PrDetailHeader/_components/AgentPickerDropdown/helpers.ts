import { STORAGE_KEY_PREFIX } from "./constants";

export const storageKey = (workspaceId: string) => `${STORAGE_KEY_PREFIX}${workspaceId}`;

/** Read the stored agent-id selection for a workspace; [] on any failure. */
export function readStoredSelection(workspaceId: string | null | undefined): string[] {
  if (!workspaceId || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(workspaceId)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeStoredSelection(workspaceId: string | null | undefined, ids: string[]): void {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(ids));
  } catch {
    /* storage unavailable (private mode / quota) — selection just isn't remembered */
  }
}

/** Keep only ids that are still enabled agents, preserving the given order. */
export function keepEnabled(ids: string[], enabledIds: string[]): string[] {
  const enabled = new Set(enabledIds);
  return ids.filter((id) => enabled.has(id));
}

/** Mean duration in whole seconds, or null when there is no estimate yet. */
export function estimateSeconds(
  meanDurationMs: number | null | undefined,
  sampleSize: number | undefined,
): number | null {
  if (meanDurationMs == null || !sampleSize) return null;
  return Math.max(1, Math.round(meanDurationMs / 1000));
}
