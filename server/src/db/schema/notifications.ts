import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';

// ============================================================ Notifications

/**
 * In-app notification center: one row per finished long-running operation
 * (review, multi-agent review, eval suite, clone, indexing, onboarding tour,
 * interrupted work). Written by `modules/notifications` only; retention is
 * enforced there (last N per workspace, max age).
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['review', 'multi_agent', 'eval', 'clone', 'index', 'onboarding', 'interrupted', 'doc_sync'],
    }).notNull(),
    status: text('status', { enum: ['success', 'error', 'info'] }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** Studio route that opens the result (e.g. /repos/:id/pulls/:number). */
    href: text('href'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ workspaceCreatedIdx: index('notifications_workspace_created_idx').on(t.workspaceId, t.createdAt) }),
);
