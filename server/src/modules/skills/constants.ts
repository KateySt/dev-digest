/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Rolling window for the Stats tab's "Findings 30D" tile. */
export const STATS_WINDOW_DAYS = 30;

/** Server-side fetch guard for `importFromUrl` — a fetched skill body is
 *  read as plain text, so cap both wait time and size before it ever reaches
 *  the DB / prompt. */
export const IMPORT_URL_TIMEOUT_MS = 5000;
export const IMPORT_URL_MAX_BYTES = 200_000;

/** Structured-output schema name for the content-scan LLM call (see
 *  `service.ts`'s `scanBody`). */
export const SKILL_SCAN_SCHEMA_NAME = 'SkillScan';

/** Community catalog listing cache TTL (SPEC-07 S-AC-6) — normal browsing
 *  costs at most one upstream tree request per this window; a forced
 *  refresh (S-AC-7) discards the cache before re-fetching. */
export const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;

/** Max simultaneous entry-body fetches during one catalog population
 *  (SPEC-07 S-AC-5/S-AC-52) — keeps a large catalog from opening hundreds of
 *  sockets at once against the raw host. */
export const CATALOG_BODY_CONCURRENCY = 8;

/** Byte-share threshold (SPEC-07 S-AC-27) below which a project language
 *  doesn't qualify as a suggestion-matching language. */
export const SUGGESTION_LANGUAGE_THRESHOLD = 0.05;
