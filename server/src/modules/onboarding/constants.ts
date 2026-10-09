/** Constants for the onboarding module (SPEC-06). */

/** Job kind registered on the shared JobRunner (see `routes.ts`). */
export const GENERATE_JOB_KIND = 'onboarding-generate';

/**
 * Self-watch deadline for the single generation job, strictly below
 * `JobRunner`'s hard 120s timeout — mirrors `repo-intel`'s
 * `INDEX_SOFT_BUDGET_MS` convention (same "finish honestly before the hard
 * cap fires" shape). Checked immediately before the persist write (S-AC-7 /
 * step 7d) — `withTimeout` is race-only and `completeStructured` accepts no
 * `AbortSignal`, so a late-returning call could otherwise still clobber a
 * good tour after the runner's own timeout already fired.
 */
export const GENERATION_DEADLINE_MS = 110_000;

/**
 * Reserved at the end of the generation window for building + persisting the
 * AC-24 skeleton. The model call's own timeout is
 * `GENERATION_DEADLINE_MS − elapsed − PERSIST_MARGIN_MS`, so a hung call is
 * abandoned (→ `model_failure_reason: 'timeout'`) early enough that the
 * skeleton is persisted BEFORE the deadline guard would skip the write
 * (S-AC-32).
 */
export const PERSIST_MARGIN_MS = 5_000;

/** `completeStructured` schemaName for the single generation call. */
export const ONBOARDING_SCHEMA_NAME = 'OnboardingGeneration';

/** Current shape of the persisted `onboarding.json` blob (contract's
 *  `schema_version` field) — bump whenever the persisted shape changes. */
export const ONBOARDING_SCHEMA_VERSION = 1;

/**
 * Fact caps — bound the prompt payload (step 6: "bounded rather than
 * proportional to repo size"), NOT the deterministic facts persisted to the
 * row (those are already capped upstream by `repo-intel`'s own
 * `getTopFilesByRank`/`getCriticalPaths` — see service.ts).
 */
/** Guided reading path length — top-N files by rank (5-8 per the spec's user story). */
export const READING_PATH_SIZE = 8;
/** Sanity cap on run commands sent to/rendered from the prompt payload. */
export const MAX_RUN_COMMANDS = 20;
/** Sanity cap on env keys included in the prompt payload (still reported
 *  verbatim/unfiltered on the persisted row per S-AC-13 — this only bounds
 *  what's sent to the model). */
export const MAX_ENV_KEYS_IN_PROMPT = 100;

/** Guard on individual clone-file reads (package.json / compose / .env.example)
 *  — matches the `IMPORT_URL_MAX_BYTES` sanity-cap convention in `skills/constants.ts`. */
export const MAX_LOCAL_RUN_FILE_BYTES = 200_000;
