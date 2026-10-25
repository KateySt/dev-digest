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
import { workspaces } from './core';
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
    // ---- Jenkins target only (null for GitHub Actions) ----
    /** Origin of the repo's Jenkins connection at export time; sync refuses another origin. */
    ciServerUrl: text('ci_server_url'),
    /** Multibranch job path (folders allowed), e.g. `devdigest-review`. */
    ciJobName: text('ci_job_name'),
    openrouterCredentialId: text('openrouter_credential_id'),
    githubCredentialId: text('github_credential_id'),
    scanCredentialId: text('scan_credential_id'),
    agentLabel: text('agent_label'),
    /** `CiSyncErrorCode` of the last failed sync; cleared by the next successful one. */
    lastSyncError: text('last_sync_error'),
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
    /** Jenkins build identity `PR-<n>#<build>@<start ms>`; null for GitHub Actions rows. */
    externalBuildId: text('external_build_id'),
  },
  (t) => [
    uniqueIndex('ci_runs_installation_run_attempt_uq').on(
      t.ciInstallationId,
      t.githubRunId,
      t.runAttempt,
    ),
    uniqueIndex('ci_runs_installation_external_build_uq').on(
      t.ciInstallationId,
      t.externalBuildId,
    ),
  ],
);

/**
 * Per-repo Jenkins connection (URL + username). The API token is NOT here: it
 * lives only in `SecretsProvider` under `jenkins_api_token:<workspace>:<repo>`.
 */
export const ciJenkinsConnections = pgTable(
  'ci_jenkins_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** `owner/name`, lowercased. */
    repo: text('repo').notNull(),
    url: text('url').notNull(),
    username: text('username').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('ci_jenkins_connections_workspace_repo_uq').on(t.workspaceId, t.repo)],
);
