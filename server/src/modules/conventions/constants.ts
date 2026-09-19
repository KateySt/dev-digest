/** Constants for the conventions module. */

/** How many top-ranked code files (via `repoIntel.getConventionSamples`) feed
 *  the extraction prompt, on top of the config files read separately below. */
export const CODE_SAMPLE_FILE_COUNT = 12;

/** Well-known lint/format/compiler config files, read verbatim. Not sourced
 *  from `getConventionSamples` — that method explicitly excludes
 *  '.config.'/eslint/prettier paths (see repo-intel's JUNK_PATH_PATTERNS), so
 *  configs are gathered here instead, entirely in code (no model call). */
export const CONFIG_FILE_CANDIDATES = [
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
  'tsconfig.json',
  'tsconfig.base.json',
];

/** Cap on how many characters of any single sampled file go into the prompt —
 *  a huge config/file shouldn't blow the token budget. */
export const MAX_FILE_CHARS = 4000;

/** `completeStructured` schemaName for the extraction call. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Cap on candidates accepted from one LLM response, before evidence
 *  verification narrows it further — a runaway response shouldn't flood the
 *  review list. */
export const MAX_CANDIDATES = 20;
