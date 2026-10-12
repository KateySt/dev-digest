import type { MemoryInputScope, MemoryKind } from "@devdigest/shared";

export const MEMORY_KINDS: MemoryKind[] = ["decision", "convention", "preference", "fact", "learning"];
/** `team` is never offered (no team entity — SPEC-2026-10-12-memory non-goal). */
export const MEMORY_SCOPES: MemoryInputScope[] = ["repo", "global"];
export const SEARCH_DEBOUNCE_MS = 300;
/** Confidence dot thresholds (design: green ≥ 85%, amber ≥ 60%). */
export const CONFIDENCE_HIGH = 0.85;
export const CONFIDENCE_MID = 0.6;
