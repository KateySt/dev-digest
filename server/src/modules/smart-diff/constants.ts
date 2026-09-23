import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Constants for the smart-diff module. Classification is presentation
 * ordering (which role bucket a changed file's card renders under on the
 * Files-changed tab), not review reasoning — see the module doc comment in
 * `service.ts` for why this stays out of `reviewer-core/`.
 */

/** Render order for the 5 role groups — `service.ts#getForPull` always emits
 *  a group per role (even empty) in this order. */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/**
 * Ordered, first-match-wins classification rules. Matched against the
 * repo-relative path with `\` normalized to `/` (see `helpers.ts#classifyFile`).
 * No glob library exists in `server/package.json` (and none is added for this
 * one module) — every "pattern" here is a plain `RegExp` a glob like
 * `**\/__snapshots__/**` would compile to.
 *
 * Group ORDER encodes deliberate precedence for paths multiple groups could
 * otherwise claim (see `smart-diff-helpers.test.ts` for the worked disputes):
 *   - boilerplate before tests: a `__snapshots__/**` path is boilerplate even
 *     though it sits under a test directory.
 *   - tests before docs: `e2e/**` claims everything under it, including its
 *     own README.
 *   - wiring before docs: `.claude/**` (and `.github/**`) claims its own
 *     `*.md` files instead of falling to the generic docs rule.
 *   - `core` has no rules of its own — it is the fallback when nothing else
 *     matches (e.g. ordinary source files, and anything under
 *     `db/migrations/**`, which no rule here covers on purpose — see the test
 *     table).
 */
export const CLASSIFICATION_RULES: ReadonlyArray<{ role: SmartDiffRole; patterns: readonly RegExp[] }> = [
  {
    role: 'boilerplate',
    patterns: [
      /\.lock$/, // *.lock
      /(^|\/)pnpm-lock\.yaml$/,
      /(^|\/)package-lock\.json$/,
      /(^|\/)yarn\.lock$/,
      /(^|\/)dist\//, // dist/**
      /(^|\/)build\//, // build/**
      /(^|\/)__snapshots__\//, // **/__snapshots__/**
      /\.snap$/, // *.snap
      /\.generated\./, // *.generated.*
      /\.min\.js$/, // *.min.js
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/, // **/*.test.ts(x) — also matches **/*.it.test.ts
      /\.spec\.ts$/, // **/*.spec.ts
      /(^|\/)test\//, // **/test/**
      /(^|\/)tests\//, // **/tests/**
      /(^|\/)__tests__\//, // **/__tests__/**
      /^e2e\//, // e2e/**
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/, // index.ts/index.js barrels
      /\.config\./, // *.config.*
      /(^|\/)tsconfig[^/]*\.json$/, // tsconfig*.json
      /(^|\/)\.eslintrc[^/]*$/, // .eslintrc*
      /(^|\/)\.env[^/]*$/, // .env*
      /(^|\/)docker-compose[^/]*\.yml$/, // docker-compose*.yml
      /^\.github\//, // .github/**
      /^\.claude\//, // .claude/**
    ],
  },
  {
    role: 'docs',
    patterns: [
      /(^|\/)README[^/]*$/i, // README*
      /(^|\/)CHANGELOG[^/]*$/i, // CHANGELOG*
      /(^|\/)LICENSE[^/]*$/i, // LICENSE
      /^docs\//, // docs/**
      /\.md$/i, // **/*.md (fallback within the docs group)
    ],
  },
];

/** Total changed-line (additions+deletions) threshold above which the PR is
 *  flagged `split_suggestion.too_big`. */
export const TOO_BIG_LINES = 500;
