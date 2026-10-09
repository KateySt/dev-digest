import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { skills } from './skills';
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
    // One case per (source finding, target) (race-proof 409): a finding may seed one
    // case per target (its agent, each linked skill). Partial: manual cases have NULL.
    sourceFindingUnique: uniqueIndex('eval_cases_source_finding_owner_uidx')
      .on(t.sourceFindingId, t.ownerKind, t.ownerId)
      .where(sql`${t.sourceFindingId} IS NOT NULL`),
    ownerIdx: index('eval_cases_owner_idx').on(t.ownerKind, t.ownerId),
  }),
);

// One row per suite run (agent OR skill): the whole case set executed against one
// agent_versions / skill_versions snapshot, or - for a skill draft run - against
// unsaved text (skill_version NULL, is_draft true). Metrics are nullable
// (null = zero denominator). Row shape is enforced by eval_suite_runs_owner_shape_ck.
export const evalSuiteRuns = pgTable(
  'eval_suite_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['agent', 'skill'] }).notNull().default('agent'),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version'),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'cascade' }),
    skillVersion: integer('skill_version'),
    isDraft: boolean('is_draft').notNull().default(false),
    // Resolved skill_eval provider/model, recorded per skill run (null for agent runs).
    provider: text('provider'),
    model: text('model'),
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
    skillStartedIdx: index('eval_suite_runs_skill_started_idx').on(t.skillId, t.startedAt.desc()),
    // At most one running run (suite OR draft) per skill (race-proof 409).
    oneRunningPerSkill: uniqueIndex('eval_suite_runs_skill_one_running_uidx')
      .on(t.skillId)
      .where(sql`${t.status} = 'running'`),
    // At most one draft run per skill.
    oneDraftPerSkill: uniqueIndex('eval_suite_runs_skill_one_draft_uidx')
      .on(t.skillId)
      .where(sql`${t.isDraft}`),
    ownerShapeCk: check(
      'eval_suite_runs_owner_shape_ck',
      sql`(${t.ownerKind} = 'agent' AND ${t.agentId} IS NOT NULL AND ${t.agentVersion} IS NOT NULL AND ${t.skillId} IS NULL AND ${t.skillVersion} IS NULL AND NOT ${t.isDraft})
        OR (${t.ownerKind} = 'skill' AND ${t.skillId} IS NOT NULL AND ${t.agentId} IS NULL AND ${t.agentVersion} IS NULL AND ${t.isDraft} = (${t.skillVersion} IS NULL))`,
    ),
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
