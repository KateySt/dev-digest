/** Constants for the risks module. */

/** `completeStructured` schemaName for the risk-brief derivation call. */
export const RISKS_SCHEMA_NAME = 'PrRisks';

/** Controlled vocabulary for `Risk.kind` — keeps the client's icon lookup a
 *  fixed mapping instead of a fallback-heavy guess. */
export const RISK_KINDS = ['security', 'dependency', 'performance', 'reliability', 'other'] as const;
export type RiskKind = (typeof RISK_KINDS)[number];

/** Cap on how many characters of a single file's patch go into the prompt,
 *  applied per file so one huge file can't starve the rest of the diff's
 *  context — mirrors intent's `MAX_SPEC_CHARS` idea. */
export const MAX_PATCH_CHARS_PER_FILE = 3000;

/** Cap on how many changed files' patches go into the prompt. */
export const MAX_FILES = 25;
