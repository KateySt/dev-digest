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
