import { pgTable, uuid, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { skills } from './skills';

/**
 * SPEC-04 (Project Context) — the two ordered attached-document sets: an
 * agent's own set and a skill's own set. Each row is one (owner, path) pair
 * plus its position; `path` is a repo-relative string (never a content
 * snapshot or an FK to a specific repo's document row — attachment is by
 * path, matching the module's design decision). Mirrors `agent_skills`
 * (`schema/agents.ts`) exactly: composite PK, `order` integer default 0,
 * cascade delete from the owner side.
 */

export const agentContextDocuments = pgTable(
  'agent_context_documents',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.path] }) }),
);

export const skillContextDocuments = pgTable(
  'skill_context_documents',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.path] }) }),
);
