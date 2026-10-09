import { and, eq } from 'drizzle-orm';
import { aggregateSuiteScores, computeEvalMetrics } from '@devdigest/reviewer-core';
import type { Db } from './client.js';
import * as t from './schema.js';
import { inputFingerprint } from '../modules/eval/helpers.js';

/**
 * Deterministic eval demo data for ONE agent (Security Reviewer): agent
 * versions v1 + v2, eight eval cases (4 must_find, 4 must_not_flag - SPEC-09
 * AC-15/16), three completed suite runs with per-case results (the newest
 * shows a precision drop, so the regression banner appears), plus one
 * accepted finding from that agent on PR #482 so "Turn into eval case" is
 * demonstrable without a model call. All fixed inputs; idempotent - skipped
 * once the agent already has suite runs or eval cases.
 *
 * Also seeds ONE skill ("pr-quality-rubric", v1 + v2 with different text) with
 * three eval cases and two completed non-draft suite runs - one per skill
 * version, different metrics and recorded provider/model - so the per-skill
 * dashboard, Compare (skill-text diff + deltas) and the /eval Skills tab can
 * be exercised without a model call. Independent of the agent data above and
 * idempotent on its own.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedCase {
  key: 'stripe' | 'ssrf' | 'trifecta' | 'serviceRole' | 'clean' | 'retry' | 'unusedImport' | 'rawBody';
  name: string;
  kind: 'must_find' | 'must_not_flag';
  source: 'manual' | 'finding_accepted' | 'finding_dismissed';
  file: string;
  diff: string;
  expected: unknown[];
}

const CONFIG_DIFF =
  'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n' +
  '@@ -10,6 +10,7 @@\n export const config = {\n   port: Number(process.env.PORT ?? 3000),\n' +
  '+  stripeKey: "sk_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc",\n   redisUrl: process.env.REDIS_URL,\n };\n';
const WEBHOOK_DIFF =
  'diff --git a/src/api/public/webhooks.ts b/src/api/public/webhooks.ts\n--- a/src/api/public/webhooks.ts\n+++ b/src/api/public/webhooks.ts\n' +
  '@@ -60,6 +60,8 @@\n export async function forward(req: Request) {\n   const target = req.body.url;\n' +
  '+  const res = await fetch(target, { method: "POST", body: req.rawBody });\n+  return res.status;\n }\n';
const CLEAN_DIFF =
  'diff --git a/src/util/format.ts b/src/util/format.ts\n--- a/src/util/format.ts\n+++ b/src/util/format.ts\n' +
  '@@ -1,5 +1,5 @@\n-export const fmt = (n: number) => n.toFixed(2);\n+export function fmt(n: number): string {\n+  return n.toFixed(2);\n+}\n';
const RETRY_DIFF =
  'diff --git a/src/middleware/ratelimit.ts b/src/middleware/ratelimit.ts\n--- a/src/middleware/ratelimit.ts\n+++ b/src/middleware/ratelimit.ts\n' +
  '@@ -50,6 +50,7 @@\n   if (!bucket.take()) {\n+    res.status(429);\n     return res.end();\n   }\n';
const TRIFECTA_DIFF =
  'diff --git a/src/api/public/callbacks.ts b/src/api/public/callbacks.ts\n--- a/src/api/public/callbacks.ts\n+++ b/src/api/public/callbacks.ts\n' +
  '@@ -30,3 +30,7 @@\n export async function notify(req: Request) {\n   const note = req.body.note;\n' +
  '+  const customers = await db.customers.findMany({ select: { email: true, cardLast4: true } });\n' +
  '+  const summary = await llm.complete(`Summarize for the user: ${note}\\n${JSON.stringify(customers)}`);\n' +
  '+  await fetch(req.body.callbackUrl, { method: "POST", body: summary });\n+  return { ok: true };\n }\n';
const SERVICE_ROLE_DIFF =
  'diff --git a/src/lib/supabase-client.ts b/src/lib/supabase-client.ts\n--- a/src/lib/supabase-client.ts\n+++ b/src/lib/supabase-client.ts\n' +
  '@@ -1,2 +1,5 @@\n "use client";\n import { createClient } from "@supabase/supabase-js";\n+\n' +
  '+const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!;\n' +
  '+export const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);\n';
const UNUSED_IMPORT_DIFF =
  'diff --git a/src/api/public/index.ts b/src/api/public/index.ts\n--- a/src/api/public/index.ts\n+++ b/src/api/public/index.ts\n' +
  '@@ -1,4 +1,3 @@\n import { Router } from "express";\n-import { createHash } from "node:crypto";\n' +
  ' import { rateLimit } from "../../middleware/ratelimit";\n import { items } from "./items";\n';
const RAW_BODY_DIFF =
  'diff --git a/src/server.ts b/src/server.ts\n--- a/src/server.ts\n+++ b/src/server.ts\n' +
  '@@ -86,3 +86,4 @@\n app.use("/api/public", rateLimit);\n' +
  '+app.post("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);\n' +
  ' app.use(express.json());\n app.use("/api", api);\n';

/** The seeded Security Reviewer case set - exported for the SPEC-09 AC-15 balance test. */
export const CASES: SeedCase[] = [
  {
    key: 'stripe',
    name: 'stripe-key-leak',
    kind: 'must_find',
    source: 'finding_accepted',
    file: 'src/config.ts',
    diff: CONFIG_DIFF,
    expected: [
      { file: 'src/config.ts', start_line: 12, end_line: 12, severity: 'CRITICAL', category: 'security', title: 'Hardcoded Stripe secret key' },
    ],
  },
  {
    key: 'ssrf',
    name: 'ssrf-webhook',
    kind: 'must_find',
    source: 'manual',
    file: 'src/api/public/webhooks.ts',
    diff: WEBHOOK_DIFF,
    expected: [
      { file: 'src/api/public/webhooks.ts', start_line: 61, end_line: 62, severity: 'CRITICAL', category: 'security', title: 'SSRF in webhook forwarder' },
    ],
  },
  {
    key: 'trifecta',
    name: 'lethal-trifecta-callback',
    kind: 'must_find',
    source: 'manual',
    file: 'src/api/public/callbacks.ts',
    diff: TRIFECTA_DIFF,
    expected: [
      {
        file: 'src/api/public/callbacks.ts',
        start_line: 32,
        end_line: 34,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Private customer data and untrusted input sent to a caller-supplied callback URL',
      },
    ],
  },
  {
    key: 'serviceRole',
    name: 'service-role-in-client',
    kind: 'must_find',
    source: 'finding_accepted',
    file: 'src/lib/supabase-client.ts',
    diff: SERVICE_ROLE_DIFF,
    expected: [
      { file: 'src/lib/supabase-client.ts', start_line: 4, end_line: 5, severity: 'CRITICAL', category: 'security', title: 'Supabase service_role key shipped to the browser' },
    ],
  },
  {
    key: 'clean',
    name: 'clean-refactor-no-flags',
    kind: 'must_not_flag',
    source: 'manual',
    file: 'src/util/format.ts',
    diff: CLEAN_DIFF,
    expected: [],
  },
  {
    key: 'retry',
    name: 'retry-after-not-a-secret',
    kind: 'must_not_flag',
    source: 'finding_dismissed',
    file: 'src/middleware/ratelimit.ts',
    diff: RETRY_DIFF,
    expected: [{ file: 'src/middleware/ratelimit.ts', start_line: 51, end_line: 51 }],
  },
  {
    key: 'unusedImport',
    name: 'no-unused-import-warning',
    kind: 'must_not_flag',
    source: 'manual',
    file: 'src/api/public/index.ts',
    diff: UNUSED_IMPORT_DIFF,
    expected: [{ file: 'src/api/public/index.ts', start_line: 2, end_line: 2 }],
  },
  {
    key: 'rawBody',
    name: 'no-raw-body-parser-flag',
    kind: 'must_not_flag',
    source: 'finding_dismissed',
    file: 'src/server.ts',
    diff: RAW_BODY_DIFF,
    expected: [{ file: 'src/server.ts', start_line: 87, end_line: 87 }],
  },
];

interface Counts {
  m: number;
  e: number;
  g: number;
  n: number;
  k: number;
  d: number;
  pass: boolean;
}

/**
 * Per-case raw counts for each suite run: v1 misses the trifecta on its first
 * run, then v2 adds noise (an extra Stripe finding and a false positive on the
 * raw-body route), so the newest run shows the precision drop.
 */
export const RUNS: { version: 1 | 2; daysAgo: number; cost: number; counts: Record<SeedCase['key'], Counts> }[] = [
  {
    version: 1,
    daysAgo: 5,
    cost: 0.42,
    counts: {
      stripe: { m: 1, e: 1, g: 2, n: 1, k: 2, d: 0, pass: true },
      ssrf: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 1, pass: true },
      trifecta: { m: 0, e: 1, g: 0, n: 0, k: 0, d: 0, pass: false },
      serviceRole: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      clean: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
      retry: { m: 0, e: 0, g: 1, n: 0, k: 1, d: 0, pass: true },
      unusedImport: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
      rawBody: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
    },
  },
  {
    version: 1,
    daysAgo: 3,
    cost: 0.42,
    counts: {
      stripe: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      ssrf: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      trifecta: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      serviceRole: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      clean: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
      retry: { m: 0, e: 0, g: 1, n: 0, k: 1, d: 0, pass: true },
      unusedImport: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
      rawBody: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
    },
  },
  {
    version: 2,
    daysAgo: 1,
    cost: 0.46,
    counts: {
      stripe: { m: 1, e: 1, g: 2, n: 1, k: 2, d: 0, pass: true },
      ssrf: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      trifecta: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      serviceRole: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      clean: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
      retry: { m: 0, e: 0, g: 1, n: 0, k: 1, d: 0, pass: true },
      unusedImport: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
      rawBody: { m: 0, e: 0, g: 1, n: 1, k: 1, d: 0, pass: false },
    },
  },
];

// ---------------------------------------------------------------------------
// Skill eval demo data
// ---------------------------------------------------------------------------

const SKILL_NAME = 'pr-quality-rubric';
const SKILL_V1_BODY = `# PR quality rubric

Prefer small, single-purpose pull requests.
Flag a change that mixes unrelated concerns.
Flag hardcoded credentials.`;
const SKILL_V2_BODY = `# PR quality rubric

Prefer small, single-purpose pull requests.
Flag a change that mixes unrelated concerns.
Flag hardcoded credentials and secrets committed to config files.
Flag outbound requests built from caller-supplied URLs (SSRF).
Do not flag pure formatting refactors.`;

/** Skill cases reuse 3 of the agent fixtures' diffs/expectations. */
const SKILL_CASE_KEYS: SeedCase['key'][] = ['stripe', 'ssrf', 'clean'];

/** v1 misses the SSRF and the Stripe key (fails 2/3); v2 catches both. */
const SKILL_RUNS: {
  version: 1 | 2;
  daysAgo: number;
  cost: number;
  model: string;
  counts: Partial<Record<SeedCase['key'], Counts>>;
}[] = [
  {
    version: 1,
    daysAgo: 4,
    cost: 0.09,
    model: 'claude-haiku-4-5',
    counts: {
      stripe: { m: 0, e: 1, g: 1, n: 1, k: 1, d: 0, pass: false },
      ssrf: { m: 0, e: 1, g: 0, n: 0, k: 0, d: 0, pass: false },
      clean: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
    },
  },
  {
    version: 2,
    daysAgo: 1,
    cost: 0.11,
    model: 'claude-haiku-4-5',
    counts: {
      stripe: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      ssrf: { m: 1, e: 1, g: 1, n: 0, k: 1, d: 0, pass: true },
      clean: { m: 0, e: 0, g: 0, n: 0, k: 0, d: 0, pass: true },
    },
  },
];

async function seedSkillEvalData(db: Db, workspaceId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(t.skills)
    .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, SKILL_NAME)));
  if (existing) {
    const [haveCase] = await db
      .select({ id: t.evalCases.id })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'skill'), eq(t.evalCases.ownerId, existing.id)))
      .limit(1);
    const [haveRun] = await db
      .select({ id: t.evalSuiteRuns.id })
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.skillId, existing.id))
      .limit(1);
    if (haveCase || haveRun) return;
  }

  // ---- skill at v2 (clean scan, so "Run eval" is enabled) with v1 + v2 text ----
  const skill =
    existing ??
    (
      await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: SKILL_NAME,
          description: 'Rubric for evaluating overall PR quality.',
          type: 'rubric',
          source: 'manual',
          body: SKILL_V2_BODY,
          enabled: true,
          version: 2,
          scanStatus: 'clean',
          scannedAt: new Date(),
        })
        .returning()
    )[0]!;
  await db
    .insert(t.skillVersions)
    .values([
      { skillId: skill.id, version: 1, body: SKILL_V1_BODY },
      { skillId: skill.id, version: 2, body: SKILL_V2_BODY },
    ])
    .onConflictDoNothing();

  // ---- skill-owned cases ----------------------------------------------------
  const cases = CASES.filter((c) => SKILL_CASE_KEYS.includes(c.key));
  const caseRows = new Map<SeedCase['key'], typeof t.evalCases.$inferSelect>();
  for (const c of cases) {
    const [row] = await db
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'skill',
        ownerId: skill.id,
        name: c.name,
        kind: c.kind,
        source: 'manual',
        inputDiff: c.diff,
        inputMeta: { title: 'Add rate limiting to public API endpoints', body: 'Seeded eval fixture.' },
        expectedOutput: c.expected,
      })
      .returning();
    caseRows.set(c.key, row!);
  }

  // ---- one completed, non-draft suite run per skill version ----------------
  const now = Date.now();
  for (const r of SKILL_RUNS) {
    const startedAt = new Date(now - r.daysAgo * DAY_MS);
    const countsOf = (key: SeedCase['key']) => r.counts[key]!;
    const pooled = aggregateSuiteScores(
      cases.map((c) => {
        const k = countsOf(c.key);
        return { matched: k.m, expectedTotal: k.e, groundedTotal: k.g, noise: k.n, pass: k.pass, kept: k.k, dropped: k.d };
      }),
    );
    const [suite] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        ownerKind: 'skill',
        skillId: skill.id,
        skillVersion: r.version,
        isDraft: false,
        provider: 'anthropic',
        model: r.model,
        status: 'completed',
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 40_000),
        casesTotal: cases.length,
        casesDone: cases.length,
        recall: pooled.recall,
        precision: pooled.precision,
        citationAccuracy: pooled.citationAccuracy,
        passedCount: pooled.passed,
        evaluatedCount: pooled.evaluated,
        erroredCount: 0,
        durationMs: 40_000,
        costUsd: r.cost,
      })
      .returning();

    for (const c of cases) {
      const row = caseRows.get(c.key)!;
      const k = countsOf(c.key);
      const m = computeEvalMetrics({
        matched: k.m,
        expectedTotal: k.e,
        groundedTotal: k.g,
        noise: k.n,
        kept: k.k,
        dropped: k.d,
      });
      await db.insert(t.evalRuns).values({
        caseId: row.id,
        suiteRunId: suite!.id,
        status: 'ok',
        ranAt: new Date(startedAt.getTime() + 10_000),
        actualOutput: Array.from({ length: k.g }, (_, i) => ({
          file: c.file,
          start_line: 12 + i,
          end_line: 12 + i,
          title: `seeded finding ${i + 1}`,
        })),
        pass: k.pass,
        recall: m.recall,
        precision: m.precision,
        citationAccuracy: m.citationAccuracy,
        durationMs: 1200,
        costUsd: Math.round((r.cost / cases.length) * 1e4) / 1e4,
        inputFingerprint: inputFingerprint(row),
        expectedTotal: k.e,
        matched: k.m,
        groundedTotal: k.g,
        noise: k.n,
        kept: k.k,
        dropped: k.d,
      });
    }
  }
}

export async function seedEvalData(
  db: Db,
  args: { workspaceId: string; agentId: string; prId: string },
): Promise<void> {
  const { workspaceId, agentId, prId } = args;

  // Independent of the agent data below (which returns early once seeded).
  await seedSkillEvalData(db, workspaceId);

  const [agent] = await db.select().from(t.agents).where(eq(t.agents.id, agentId));
  if (!agent) return;
  const [haveCase] = await db
    .select({ id: t.evalCases.id })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)))
    .limit(1);
  const [haveRun] = await db
    .select({ id: t.evalSuiteRuns.id })
    .from(t.evalSuiteRuns)
    .where(eq(t.evalSuiteRuns.agentId, agentId))
    .limit(1);
  if (haveCase || haveRun) return;

  // ---- agent versions: v1 (older prompt) and v2 (the current one) ----------
  const snapshot = (systemPrompt: string) => ({
    provider: agent.provider,
    model: agent.model,
    system_prompt: systemPrompt,
    output_schema: null,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
    repo_intel: agent.repoIntel,
    skills: [],
  });
  await db
    .insert(t.agentVersions)
    .values([
      { agentId, version: 1, configJson: snapshot(`${agent.systemPrompt}\n\nReturn at most 5 findings ranked by severity.`) },
      { agentId, version: 2, configJson: snapshot(agent.systemPrompt) },
    ])
    .onConflictDoNothing();
  await db.update(t.agents).set({ version: 2 }).where(eq(t.agents.id, agentId));

  // ---- cases ---------------------------------------------------------------
  const caseRows = new Map<SeedCase['key'], typeof t.evalCases.$inferSelect>();
  for (const c of CASES) {
    const [row] = await db
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agentId,
        name: c.name,
        kind: c.kind,
        source: c.source,
        inputDiff: c.diff,
        inputMeta: { title: 'Add rate limiting to public API endpoints', body: 'Seeded eval fixture.' },
        expectedOutput: c.expected,
      })
      .returning();
    caseRows.set(c.key, row!);
  }

  // ---- suite runs + per-case results --------------------------------------
  const now = Date.now();
  for (const r of RUNS) {
    const startedAt = new Date(now - r.daysAgo * DAY_MS);
    const pooled = aggregateSuiteScores(
      CASES.map((c) => {
        const k = r.counts[c.key];
        return { matched: k.m, expectedTotal: k.e, groundedTotal: k.g, noise: k.n, pass: k.pass, kept: k.k, dropped: k.d };
      }),
    );
    const [suite] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId,
        agentId,
        agentVersion: r.version,
        status: 'completed',
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 95_000),
        casesTotal: CASES.length,
        casesDone: CASES.length,
        recall: pooled.recall,
        precision: pooled.precision,
        citationAccuracy: pooled.citationAccuracy,
        passedCount: pooled.passed,
        evaluatedCount: pooled.evaluated,
        erroredCount: 0,
        durationMs: 95_000,
        costUsd: r.cost,
      })
      .returning();

    for (const c of CASES) {
      const row = caseRows.get(c.key)!;
      const k = r.counts[c.key];
      const m = computeEvalMetrics({
        matched: k.m,
        expectedTotal: k.e,
        groundedTotal: k.g,
        noise: k.n,
        kept: k.k,
        dropped: k.d,
      });
      await db.insert(t.evalRuns).values({
        caseId: row.id,
        suiteRunId: suite!.id,
        status: 'ok',
        ranAt: new Date(startedAt.getTime() + 20_000),
        actualOutput: Array.from({ length: k.g }, (_, i) => ({
          file: c.file,
          start_line: 12 + i,
          end_line: 12 + i,
          title: `seeded finding ${i + 1}`,
        })),
        pass: k.pass,
        recall: m.recall,
        precision: m.precision,
        citationAccuracy: m.citationAccuracy,
        durationMs: 1800,
        costUsd: Math.round((r.cost / CASES.length) * 1e4) / 1e4,
        inputFingerprint: inputFingerprint(row),
        expectedTotal: k.e,
        matched: k.m,
        groundedTotal: k.g,
        noise: k.n,
        kept: k.k,
        dropped: k.d,
      });
    }
  }

  // ---- one accepted finding by this agent on PR #482 (for the e2e flow) ----
  // Created an hour BEFORE the existing seeded review so that review stays
  // the newest one on the PR.
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId,
      prId,
      agentId,
      kind: 'review',
      verdict: 'request_changes',
      summary: 'Seeded agent review: the webhook forwarder fetches a caller-supplied URL.',
      score: 40,
      model: 'seed',
      createdAt: new Date(now - 60 * 60 * 1000),
    })
    .returning();
  await db.insert(t.findings).values({
    reviewId: review!.id,
    file: 'src/api/public/webhooks.ts',
    startLine: 61,
    endLine: 74,
    severity: 'CRITICAL',
    category: 'security',
    title: 'SSRF: webhook target URL is fetched without an allowlist',
    rationale: 'The forwarder fetches a URL taken straight from the request body.',
    suggestion: 'Resolve the host and reject private address ranges, or use an allowlist.',
    confidence: 0.91,
    acceptedAt: new Date(now - 30 * 60 * 1000),
  });
}
