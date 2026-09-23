/** Constants for the intent module. */

/**
 * A same-repo spec/plan doc reference: a relative path under `specs/` or
 * `docs/` ending in `.md`. Deliberately narrow — this must NEVER match an
 * external URL (a PR body linking to some other site's markdown file is not
 * "this repo's spec"), so callers check the candidate token doesn't contain
 * `://` before testing it against this pattern (see `helpers.ts#detectSpecRef`).
 */
export const SPEC_REF_PATTERN = /^(?:specs|docs)\/[\w.-]+(?:\/[\w.-]+)*\.md$/i;

/** Linked-issue reference — mirrors octokit's `resolveLinkedIssue` regex. */
export const ISSUE_REF_PATTERN = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

/** Cap on how many characters of a spec/plan doc go into the prompt — mirrors
 *  the conventions module's `MAX_FILE_CHARS` idea. */
export const MAX_SPEC_CHARS = 4000;

/** Below this many characters, a PR body (or linked issue body) doesn't count
 *  as "real documentation" — the intent falls back to indirect signals and is
 *  marked low-confidence. */
export const MIN_DOC_CHARS = 40;

/** `completeStructured` schemaName for the intent-derivation call. */
export const INTENT_SCHEMA_NAME = 'PrIntent';
