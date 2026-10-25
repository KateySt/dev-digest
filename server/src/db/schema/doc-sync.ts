import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Docs Sync

/**
 * One schedule per workspace (server/specs/doc-sync.md). `nextRunAt` is
 * server-computed from the rule (+ one-off override) and polled by the ticker.
 */
export const docSyncSchedules = pgTable('doc_sync_schedules', {
  workspaceId: uuid('workspace_id')
    .primaryKey()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  /** `HH:mm`, wall-clock in `timezone`. */
  time: text('time').notNull().default('02:00'),
  /** ISO weekdays 1–7; empty = every day. */
  days: jsonb('days').$type<number[]>().notNull().default([]),
  repeat: boolean('repeat').notNull().default(true),
  timezone: text('timezone').notNull().default('UTC'),
  nextRunOverride: timestamp('next_run_override', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const docSyncRuns = pgTable(
  'doc_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    trigger: text('trigger', { enum: ['scheduled', 'manual'] }).notNull(),
    status: text('status', { enum: ['running', 'done', 'failed'] }).notNull().default('running'),
    error: text('error'),
    startedAt: now(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({ wsStartedIdx: index('doc_sync_runs_ws_started_idx').on(t.workspaceId, t.startedAt) }),
);

export interface DocSyncFindingRow {
  path: string;
  line: number;
  kind: 'broken_link' | 'missing_path' | 'unknown_script';
  target: string;
}

/** One LLM-confirmed drift: a claim in a doc that no longer matches the code. */
export interface DocSyncIssueRow {
  path: string;
  claim: string;
  problem: string;
  /** True when the docs PR fixes it. */
  fixed: boolean;
}

export const docSyncRepoResults = pgTable(
  'doc_sync_repo_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => docSyncRuns.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'unchanged', 'up_to_date', 'stale', 'failed'] })
      .notNull()
      .default('pending'),
    checkedSha: text('checked_sha'),
    docsScanned: integer('docs_scanned').notNull().default(0),
    findings: jsonb('findings').$type<DocSyncFindingRow[]>().notNull().default([]),
    /** Findings before the storage cap — the UI shows "N more". */
    findingsTotal: integer('findings_total').notNull().default(0),
    error: text('error'),
    // Phase 2 — LLM review + docs PR.
    issues: jsonb('issues').$type<DocSyncIssueRow[]>().notNull().default([]),
    docsUpdated: integer('docs_updated').notNull().default(0),
    prUrl: text('pr_url'),
    prAction: text('pr_action', { enum: ['opened', 'updated', 'none', 'branch_moved', 'failed'] }),
    prError: text('pr_error'),
    costUsd: doublePrecision('cost_usd'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({ runRepoUq: uniqueIndex('doc_sync_repo_results_run_repo_uq').on(t.runId, t.repoId) }),
);
