/** SPEC-04 (Project Context) constants. */

/** Allowlisted path segments a document must contain (at any depth) to be
 *  discovered/attachable (AC-1, AC-24). Order = tag-resolution priority when
 *  a path overlaps more than one segment (AC-1 edge case: `docs/specs/x.md`
 *  is tagged with whichever segment appears FIRST walking the path). */
export const ALLOWED_SOURCE_FOLDERS = ['specs', 'docs', 'insights'] as const;

/** Directories never walked during discovery — same junk set repo-intel
 *  already excludes, so a vendored/build copy of a spec dir is never listed
 *  twice. */
export const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
]);

/** Whole-document token budget for the resolved project-context set (AC-18).
 *  Generous relative to a single-pass review prompt — the goal is to catch
 *  runaway attachment, not to constrain normal use. */
export const PROJECT_CONTEXT_TOKEN_BUDGET = 12_000;

/** Per-document size cap in bytes (AC-32 – AC-34, 2026-10-07). A document
 *  larger than this is never read in full: dropped from a run (reported as
 *  `dropped_for_budget`), 413 on the direct read, 422 on create/save. 256 KiB
 *  is far above any hand-written spec/doc and far below what would let one
 *  attached file exhaust memory or the prompt. */
export const MAX_DOCUMENT_BYTES = 256 * 1024;

/** Request-shape caps (route-level zod `.max()`): one repo-relative path, and
 *  the number of paths in a whole-set replace (AC-9, AC-10). */
export const MAX_DOCUMENT_PATH_LENGTH = 512;
export const MAX_ATTACHED_PATHS = 200;
