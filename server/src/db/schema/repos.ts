import { pgTable, uuid, text, timestamp, jsonb, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces, users } from './core';

export const repos = pgTable(
  'repos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch').notNull().default('main'),
    clonePath: text('clone_path'),
    // Bytes-per-language, as returned by GitHub's repo languages endpoint.
    // Repo-wide (GitHub has no per-PR breakdown) — refetched on clone/refresh.
    languages: jsonb('languages').$type<Record<string, number>>(),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    // Docs Sync (server/specs/doc-sync.md): opt-in + the HEAD last checked, so
    // an unchanged repo costs nothing on the next run.
    docSyncEnabled: boolean('doc_sync_enabled').notNull().default(false),
    docSyncLastSha: text('doc_sync_last_sha'),
    docSyncCheckedAt: timestamp('doc_sync_checked_at', { withTimezone: true }),
    /** Tip of `devdigest/docs-sync` as we last pushed it — anything else means a human pushed there. */
    docSyncBranchSha: text('doc_sync_branch_sha'),
    /** Claims in the docs PR currently open — become "dismissed" if it's closed unmerged. */
    docSyncPrClaims: jsonb('doc_sync_pr_claims').$type<{ path: string; claim: string }[]>().notNull().default([]),
    /** Claims from docs PRs closed without merging — never proposed again. */
    docSyncDismissed: jsonb('doc_sync_dismissed').$type<{ path: string; claim: string }[]>().notNull().default([]),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
  },
  (t) => ({
    uq: uniqueIndex('repos_ws_fullname_uq').on(t.workspaceId, t.fullName),
    wsIdx: index('repos_ws_idx').on(t.workspaceId),
  }),
);
