import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    // must_find: expected findings; must_not_flag: forbidden locations (empty = whole diff).
    kind: text('kind', { enum: ['must_find', 'must_not_flag'] })
      .notNull()
      .default('must_find'),
    source: text('source', { enum: ['manual', 'finding_accepted', 'finding_dismissed'] })
      .notNull()
      .default('manual'),
    // Link to the finding this case was seeded from; cleared (case kept) when
    // the finding/review/PR is deleted.
    sourceFindingId: uuid('source_finding_id').references(() => findings.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  (t) => ({
    // One case per source finding (race-proof 409). Partial: manual cases have NULL.
    sourceFindingUnique: uniqueIndex('eval_cases_source_finding_uidx')
      .on(t.sourceFindingId)
      .where(sql`${t.sourceFindingId} IS NOT NULL`),
    ownerIdx: index('eval_cases_owner_idx').on(t.ownerKind, t.ownerId),
  }),
);

// One row per agent suite run: the whole case set executed against one
// agent_versions snapshot. Metrics are nullable (null = zero denominator).
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version').notNull(),
    status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
    failureReason: text('failure_reason'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total').notNull(),
    casesDone: integer('cases_done').notNull().default(0),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    passedCount: integer('passed_count').notNull().default(0),
    evaluatedCount: integer('evaluated_count').notNull().default(0),
    erroredCount: integer('errored_count').notNull().default(0),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    agentStartedIdx: index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt.desc()),
    // At most one running suite run per agent (race-proof 409).
    oneRunningPerAgent: uniqueIndex('eval_suite_runs_one_running_uidx')
      .on(t.agentId)
      .where(sql`${t.status} = 'running'`),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    // Null for single-case runs ("Run case" / "Run on save") and pre-suite rows.
    suiteRunId: uuid('suite_run_id').references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['ok', 'errored'] }).notNull().default('ok'),
    error: text('error'),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    // Hash of the case inputs at run time — detects edited cases in compare.
    inputFingerprint: text('input_fingerprint'),
    // Raw counts for pooled (not averaged) suite metrics.
    expectedTotal: integer('expected_total'),
    matched: integer('matched'),
    groundedTotal: integer('grounded_total'),
    noise: integer('noise'),
    kept: integer('kept'),
    dropped: integer('dropped'),
  },
  (t) => ({
    caseRanIdx: index('eval_runs_case_ran_idx').on(t.caseId, t.ranAt.desc()),
    suiteIdx: index('eval_runs_suite_idx').on(t.suiteRunId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
