import { pgTable, uuid, text, integer, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

export const pullRequests = pgTable(
  'pull_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    avatarUrl: text('avatar_url'),
    branch: text('branch').notNull(),
    base: text('base').notNull(),
    headSha: text('head_sha').notNull(),
    lastReviewedSha: text('last_reviewed_sha'),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    filesCount: integer('files_count').notNull().default(0),
    status: text('status').notNull().default('needs_review'),
    body: text('body'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }),
  },
  (t) => ({
    uq: uniqueIndex('pr_repo_number_uq').on(t.repoId, t.number), // idempotent import
    wsIdx: index('pr_ws_idx').on(t.workspaceId),
  }),
);

export const prFiles = pgTable('pr_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  additions: integer('additions').notNull().default(0),
  deletions: integer('deletions').notNull().default(0),
  patch: text('patch'),
});

export const prCommits = pgTable('pr_commits', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  sha: text('sha').notNull(),
  message: text('message').notNull(),
  author: text('author').notNull(),
  committedAt: timestamp('committed_at', { withTimezone: true }),
});

/**
 * Permanent cache of "which files did commit X touch", keyed by (repo_id,
 * sha) rather than `pr_commits.id` — `pr_commits` rows get deleted and
 * re-inserted on every `GET /pulls/:id` (see `modules/pulls/routes.ts`), so
 * those UUIDs aren't stable across requests, and keying on (repo, sha)
 * lets two PRs that share a commit (e.g. a rebase) reuse the same cache row.
 * No staleness column: a commit's file set never changes once made, so there
 * is nothing to invalidate. This does mean a commit with genuinely zero
 * changed files is indistinguishable from "not yet fetched" and will be
 * re-fetched from GitHub on every request — accepted tradeoff over adding a
 * second marker table just for that edge case (see Development Plan step 6).
 */
export const commitFiles = pgTable(
  'commit_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    path: text('path').notNull(),
    // Reuses the shared `now()` helper (column `created_at`, like every other
    // table in this file) rather than a bespoke `fetched_at` column — this
    // row's creation time IS the fetch time, so field name matches convention.
    createdAt: now(),
  },
  (t) => ({
    uq: uniqueIndex('commit_files_repo_sha_path_uq').on(t.repoId, t.sha, t.path),
    repoShaIdx: index('commit_files_repo_sha_idx').on(t.repoId, t.sha),
  }),
);
