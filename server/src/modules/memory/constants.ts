/**
 * Memory & Learn (SPEC-2026-10-12-memory) — tunables.
 */

/** Token budget of the injected `## Relevant memory` block (AC-16). */
export const MEMORY_TOKEN_BUDGET = 1500;
/** Hard cap of injected / exported entries (AC-16, AC-30). */
export const MEMORY_MAX_ENTRIES = 20;

/** Duplicate check (AC-9): cosine similarity floor when embeddings are on. */
export const MEMORY_DUP_COSINE = 0.88;
/** Duplicate check (AC-9): floor on the full-text fallback score,
 *  `ts_rank_cd(tsv, OR-query, 32)` ∈ [0,1). Measured: near-duplicate sentences
 *  ≈ 0.37, sentences sharing one or two words ≤ 0.17. */
export const MEMORY_FTS_DUP_THRESHOLD = 0.25;
/** Duplicate check: how many similar memories to show. */
export const MEMORY_SIMILAR_LIMIT = 3;

/** Memory page semantic search: cosine floor so a query narrows the list. */
export const MEMORY_SEARCH_MIN_COSINE = 0.3;

/** Stale marker (UI only): unused for longer than this. */
export const MEMORY_STALE_DAYS = 60;

/** Learn draft LLM call deadline before the deterministic fallback (AC-5). */
export const LEARN_DRAFT_TIMEOUT_MS = 10_000;
export const LEARN_DRAFT_SCHEMA_NAME = 'memory_draft';

/** Query text for ranking: cap on the diff portion (chars). */
export const MEMORY_QUERY_DIFF_CHARS = 4000;

/** Search list page size (no pagination in v1). */
export const MEMORY_LIST_LIMIT = 200;
