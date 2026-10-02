import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
    source: text('source', {
      enum: ['manual', 'imported_url', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    // Content-scan gate (prompt-injection / malicious-skill detection) — every
    // skill is scanned before it can be enabled; see modules/skills/service.ts.
    scanStatus: text('scan_status', { enum: ['pending', 'clean', 'flagged', 'error'] })
      .notNull()
      .default('pending'),
    scanFindings: jsonb('scan_findings').$type<unknown[]>(),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    // Project scope (SPEC-07): null = global, non-null = scoped to that repo.
    // Additive, zero-backfill — every pre-existing row (including legacy
    // fixture-sourced `source: 'community'` rows) keeps a null repo_id, per
    // server spec AC-34. Cascades so deleting a repo deletes its skills
    // (AC-25) while leaving global skills untouched.
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    // Catalog tag slugs (SPEC-07); null for every pre-existing row, populated
    // only by community imports from the live catalog. Native text[] (not
    // jsonb like evidenceFiles) per the dev plan — a flat slug list, no need
    // for jsonb's nested-document flexibility.
    tags: text('tags').array(),
    // Repo-relative catalog path a community import came from (e.g.
    // "python/no-bare-except.md") — SPEC-07 S-AC-28 gap-fill. Null for every
    // pre-existing row (including manual/imported_url skills and community
    // skills imported before this column existed); same additive,
    // zero-backfill discipline as repoId/tags above. Lets suggestion
    // exclusion match the exact catalog entry instead of the imprecise
    // (name, folder-tag) proxy — see communitySkillSourcePathsForRepo in
    // modules/skills/repository.ts.
    sourcePath: text('source_path'),
    createdAt: now(),
  },
  (t) => ({
    // Manual index: Postgres does not auto-index FK columns.
    repoIdx: index('skills_repo_idx').on(t.repoId),
  }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
