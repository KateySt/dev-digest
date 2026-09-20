import type { CommunitySkill } from '@devdigest/shared';

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

/**
 * Fixture "community skills" catalog. No live external index exists in this
 * repo (same fixture-not-live-service pattern as the seeded demo repo/PR) —
 * this is what `GET /skills/community` searches and `POST
 * /skills/import-community` imports from.
 */
export const COMMUNITY_SKILLS: (CommunitySkill & { body: string })[] = [
  {
    name: 'no-then-chains',
    repo: 'community/js-style-skills',
    stars: 412,
    lang: 'JavaScript/TypeScript',
    desc: 'Flags `.then()` chains that should be `async`/`await` for readability and error handling.',
    body: '# No .then() chains\n\nPrefer `async`/`await` over `.then()` chains of more than one link. A chained `.then()` sequence hides error propagation and is harder to step through than an equivalent `try { await ... } catch`. Flag any `.then().then(` chain longer than one link as a WARNING and suggest the `async`/`await` rewrite.',
  },
  {
    name: 'phantom-api-gate',
    repo: 'community/api-hygiene-skills',
    stars: 268,
    lang: 'Any',
    desc: 'Flags new endpoints exposed without an accompanying authorization check.',
    body: '# Phantom API gate\n\nEvery new route handler must have a visible authorization check (middleware, decorator, or inline guard) before it touches any data scoped to a user, tenant, or workspace. A new route that reads or writes such data with no visible auth check is a CRITICAL finding — do not assume an outer gate exists unless it is visible in the diff.',
  },
  {
    name: 'secret-leakage-gate',
    repo: 'community/security-baseline-skills',
    stars: 891,
    lang: 'Any',
    desc: 'Flags hardcoded secrets, API keys, and credentials committed in code.',
    body: '# Secret leakage gate\n\nAny literal that looks like an API key, access token, private key, password, or connection string with embedded credentials is a CRITICAL finding, regardless of whether the surrounding code is described as a test fixture, example, or "not for production". Recommend moving it to an environment variable / secrets manager and rotating the exposed credential.',
  },
  {
    name: 'pr-quality-rubric',
    repo: 'community/review-rubrics',
    stars: 156,
    lang: 'Any',
    desc: 'A general PR-quality rubric: scope, commit hygiene, and self-review signals.',
    body: '# PR quality rubric\n\nPrefer small, single-purpose PRs. Flag (SUGGESTION) a PR that mixes an unrelated refactor with a behavioral change — call out which hunks belong to which concern so they can be split. Flag (WARNING) a diff that touches a public function signature without updating its call sites in the same diff.',
  },
];
