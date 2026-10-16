import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  check,
  boolean,
  customType,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { agents } from './agents';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

// SPEC-2026-10-12-memory. Rows are written ONLY by a human-confirmed Learn /
// edit; read at review time by modules/memory/retrieval.ts.
export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    // Repo-relative globs; empty = applies to any changed file.
    pathGlobs: text('path_globs').array().notNull().default(sql`'{}'::text[]`),
    appliesToAllAgents: boolean('applies_to_all_agents').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // SPEC-2026-10-12-memory-curation: set on a member archived by a merge.
    mergedInto: uuid('merged_into').references((): AnyPgColumn => memory.id, { onDelete: 'set null' }),
    // Curation "Keep": resets the stale clock (greatest(last used / created, kept_at)).
    keptAt: timestamp('kept_at', { withTimezone: true }),
    // Full-text fallback when embeddings are off (built-in; PGlite has no pg_trgm).
    contentTsv: tsvector('content_tsv').generatedAlwaysAs(sql`to_tsvector('english', content)`),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    wsIdx: index('memory_ws_idx').on(t.workspaceId),
    wsRepoIdx: index('memory_ws_repo_idx').on(t.workspaceId, t.repoId),
    embeddingHnsw: index('memory_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops')),
    tsvGin: index('memory_tsv_gin').using('gin', t.contentTsv),
  }),
);

/** Which agents / skills a memory applies to (exactly one target per row). */
export const memoryLinks = pgTable(
  'memory_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    memoryId: uuid('memory_id')
      .notNull()
      .references(() => memory.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    oneTarget: check('memory_links_one_target', sql`num_nonnulls(${t.agentId}, ${t.skillId}) = 1`),
    memAgentUq: uniqueIndex('memory_links_mem_agent_uq').on(t.memoryId, t.agentId),
    memSkillUq: uniqueIndex('memory_links_mem_skill_uq').on(t.memoryId, t.skillId),
    agentIdx: index('memory_links_agent_idx').on(t.agentId),
    skillIdx: index('memory_links_skill_idx').on(t.skillId),
  }),
);

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    evidenceSnippet: text('evidence_snippet'),
    evidenceLine: integer('evidence_line'),
    confidence: doublePrecision('confidence'),
    category: text('category', {
      enum: ['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'],
    })
      .notNull()
      .default('general'),
    rationale: text('rationale'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    // SPEC-2026-10-16-convention-skills: the skill this convention was merged
    // into. Null = still unused. SET NULL so deleting the skill returns the
    // convention to "ready" (still accepted) instead of deleting it.
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  (t) => ({
    repoCreatedIdx: index('conventions_repo_created_idx').on(t.repoId, t.createdAt),
    // Manual index: Postgres does not auto-index FK columns.
    skillIdx: index('conventions_skill_idx').on(t.skillId),
    categoryCk: check(
      'conventions_category_ck',
      sql`${t.category} = ANY (ARRAY['naming', 'structure', 'errors', 'testing', 'imports', 'typing', 'api', 'general'])`,
    ),
    statusCk: check(
      'conventions_status_ck',
      sql`${t.status} = ANY (ARRAY['pending', 'accepted', 'rejected'])`,
    ),
  }),
);
