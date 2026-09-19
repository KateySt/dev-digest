import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and the
 * body-version-bump rule. No I/O.
 */

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** True when a patch changes `body` relative to the existing row — only a
 *  body change bumps the skill's version and snapshots `skill_versions`
 *  (unlike agents, cosmetic fields like name/description/type don't). */
export function isBodyChange(existing: Pick<SkillRow, 'body'>, patch: { body?: string }): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

/** Derive a skill name from the first markdown heading (`#`/`##`) in `body`,
 *  falling back to `fallback` when no heading is found. Used by file/URL
 *  import when the user leaves the name field blank. */
export function nameFromMarkdown(body: string, fallback: string): string {
  const match = body.match(/^#{1,2}\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading && heading.length > 0 ? heading : fallback;
}
