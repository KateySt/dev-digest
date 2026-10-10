import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  jsonb,
  timestamp,
  doublePrecision,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    /** GitHub's numeric repo id — the ingest trusts this, not the repo name. */
    githubRepoId: bigint('github_repo_id', { mode: 'number' }),
    branch: text('branch'),
    workflowPath: text('workflow_path'),
    workflowVersion: integer('workflow_version'),
    manifestVersion: integer('manifest_version'),
    /** The agent's `ci_fail_on` at export time; a mismatch flags "out of date". */
    exportedCiFailOn: text('exported_ci_fail_on'),
    postAs: text('post_as'),
    triggers: jsonb('triggers').$type<string[]>(),
    prUrl: text('pr_url'),
    /** Stable per-installation agent slug (manifest path, job, artifact name). Null on legacy rows. */
    agentSlug: text('agent_slug'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('ci_installations_agent_repo_uq').on(t.agentId, t.repo)],
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    githubRunId: bigint('github_run_id', { mode: 'number' }),
    runAttempt: integer('run_attempt'),
    commitSha: text('commit_sha'),
    prTitle: text('pr_title'),
    verdict: text('verdict'),
    critical: integer('critical'),
    warning: integer('warning'),
    suggestion: integer('suggestion'),
    blockers: integer('blockers'),
    durationMs: integer('duration_ms'),
    model: text('model'),
    manifestVersion: integer('manifest_version'),
    jobUrl: text('job_url'),
    ingestError: text('ingest_error'),
    agentSlug: text('agent_slug'),
  },
  (t) => [
    uniqueIndex('ci_runs_installation_run_attempt_uq').on(
      t.ciInstallationId,
      t.githubRunId,
      t.runAttempt,
    ),
  ],
);
