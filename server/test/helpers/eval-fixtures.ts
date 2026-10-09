import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { MockEmbedder, MockGitClient, MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../../src/adapters/mocks.js';
import type { Container } from '../../src/platform/container.js';
import * as t from '../../src/db/schema.js';
import type { PgFixture } from './pg.js';

type Db = PgFixture['handle']['db'];

/** Shared fixtures + helpers for the eval integration suites (Ring 2, testcontainers). */

export const evalConfig = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** src/config.ts with TWO hunks (new-side 10-12 and 50-52) + an unrelated file. */
export const MULTI_HUNK_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
@@ -50,3 +51,4 @@
   a: 1,
+  debug: true,
   b: 2,
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
 export {};
+export const z = 1;`;

/** Single hunk — new-side lines 10-12; line 11 is the added one. */
export const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

export function finding(overrides: Partial<Review['findings'][number]> = {}): Review['findings'][number] {
  return {
    id: 'f-grounded',
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded Stripe secret key',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'A live Stripe key is committed in source.',
    confidence: 0.95,
    ...overrides,
  };
}

export function review(findings: Review['findings']): Review {
  return { verdict: findings.length ? 'request_changes' : 'approve', summary: 's', score: 50, findings };
}

/** Grounded (line 11) + hallucinated (line 999, dropped by grounding). */
export const REVIEW_ONE_HIT_ONE_DROP = review([
  finding(),
  finding({ id: 'f-bad', start_line: 999, end_line: 999, title: 'Phantom' }),
]);

export const EXPECTED_LINE_11 = [{ file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL' }];

export interface ScriptedResult {
  review: Review;
  /** `undefined` -> 0.001 like MockLLMProvider; `null` -> unknown cost. */
  costUsd?: number | null;
}
export type ScriptedHandler = (ctx: { caseName: string | null; call: number }) => ScriptedResult | Promise<ScriptedResult>;

/**
 * LLM whose answer is decided per call by `handler` (may throw for an errored
 * case, return `costUsd: null`, or await a gate). The eval case being reviewed
 * is recovered from the prompt's task line: `Review eval case "<name>"`.
 */
export class ScriptedLLM extends MockLLMProvider {
  public callCount = 0;
  /** Every structured request received, in order (assert prompt / model / skill text). */
  public requests: StructuredRequest<unknown>[] = [];
  constructor(public handler: ScriptedHandler) {
    super('openai');
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const call = ++this.callCount;
    this.requests.push(req as StructuredRequest<unknown>);
    const text = JSON.stringify(req.messages);
    const m = text.match(/Review eval case \\"([^"\\]+)\\"/);
    const out = await this.handler({ caseName: m?.[1] ?? null, call });
    const data = (req.schema as unknown as { parse: (v: unknown) => T }).parse(out.review);
    return {
      data,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: out.costUsd === undefined ? 0.001 : out.costUsd,
      raw: '{}',
      attempts: 1,
    } as StructuredResult<T>;
  }
}

/** A promise you resolve from the test — used to hold a case "in flight". */
export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

export type App = FastifyInstance & { container: Container };

export async function makeApp(
  pg: PgFixture,
  opts: { llm?: MockLLMProvider; github?: MockGitHubClient | null; git?: MockGitClient } = {},
): Promise<App> {
  const overrides: Record<string, unknown> = {
    embedder: new MockEmbedder(),
    git: opts.git ?? new MockGitClient({ diff: MULTI_HUNK_DIFF }),
    llm: (() => {
      const llm = opts.llm ?? new MockLLMProvider('openai', { structured: REVIEW_ONE_HIT_ONE_DROP });
      // `skill_eval` resolves to openrouter by default - route it to the same stub.
      return { openai: llm, openrouter: llm };
    })(),
  };
  if (opts.github !== null) overrides.github = opts.github ?? new MockGitHubClient();
  // `github: null` = "not connected": empty secrets so a developer's real GITHUB_TOKEN is never picked up.
  else overrides.secrets = new MockSecretsProvider({});
  return (await buildApp({ config: evalConfig(), db: pg.handle.db, overrides })) as unknown as App;
}

let seq = 0;
export const uniq = (p: string) => `${p}-${++seq}`;

export async function makeAgent(app: App, name = uniq('Agent')): Promise<{ id: string; version: number; [k: string]: unknown }> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents',
    payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
  });
  return res.json();
}

export async function makeCase(
  app: App,
  agentId: string,
  over: Record<string, unknown> = {},
): Promise<{ id: string; name: string; [k: string]: unknown }> {
  const res = await app.inject({
    method: 'POST',
    url: '/eval-cases',
    payload: {
      owner_kind: 'agent',
      owner_id: agentId,
      name: uniq('case'),
      input_diff: DIFF,
      expected_output: EXPECTED_LINE_11,
      ...over,
    },
  });
  if (res.statusCode !== 201) throw new Error(`makeCase failed: ${res.statusCode} ${res.body}`);
  return res.json();
}

export interface SuiteRunBody {
  id: string;
  status: 'running' | 'completed' | 'failed';
  cases_total: number;
  cases_done: number;
  agent_version: number;
  failure_reason?: string | null;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  passed_count: number;
  evaluated_count: number;
  errored_count: number;
  duration_ms: number | null;
  cost_usd: number | null;
  results: Array<{
    case_id: string;
    case_name: string | null;
    status: 'ok' | 'errored';
    error: string | null;
    pass: boolean | null;
    suite_run_id: string | null;
    cost_usd: number | null;
  }>;
}

export async function getRun(app: App, runId: string): Promise<SuiteRunBody> {
  return (await app.inject({ method: 'GET', url: `/eval-suite-runs/${runId}` })).json();
}

/** Poll `GET /eval-suite-runs/:id` until the run leaves `running`. */
export async function waitForSuite(app: App, runId: string, timeoutMs = 15_000): Promise<SuiteRunBody> {
  const start = Date.now();
  for (;;) {
    const run = await getRun(app, runId);
    if (run.status !== 'running') return run;
    if (Date.now() - start > timeoutMs) throw new Error(`suite run ${runId} still running after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Poll until `cases_done` reaches `n` (run still `running`). */
export async function waitForProgress(app: App, runId: string, n: number, timeoutMs = 15_000): Promise<SuiteRunBody> {
  const start = Date.now();
  for (;;) {
    const run = await getRun(app, runId);
    if (run.cases_done >= n) return run;
    if (Date.now() - start > timeoutMs) throw new Error(`run ${runId} never reached ${n} cases_done`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

export async function startRun(app: App, agentId: string) {
  return app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
}

export async function defaultWorkspaceId(db: Db): Promise<string> {
  const [ws] = await db.select().from(t.workspaces);
  return ws!.id;
}

/** Insert a finished suite run directly (history / dashboard / compare fixtures). */
export async function insertSuiteRun(
  db: Db,
  workspaceId: string,
  agentId: string,
  over: Partial<typeof t.evalSuiteRuns.$inferInsert> = {},
) {
  const [row] = await db
    .insert(t.evalSuiteRuns)
    .values({
      workspaceId,
      agentId,
      agentVersion: 1,
      status: 'completed',
      casesTotal: 5,
      casesDone: 5,
      recall: 0.8,
      precision: 0.8,
      citationAccuracy: 0.9,
      passedCount: 4,
      evaluatedCount: 5,
      erroredCount: 0,
      durationMs: 1000,
      costUsd: 0.1,
      startedAt: new Date(),
      finishedAt: new Date(),
      ...over,
    })
    .returning();
  return row!;
}

/** Repo + PR + agent-owned review + one finding (+ optional pr_files patch). */
export async function insertFindingFixture(
  db: Db,
  workspaceId: string,
  opts: {
    agentId: string | null;
    decision?: 'accepted' | 'dismissed' | null;
    finding?: Partial<typeof t.findings.$inferInsert>;
    patch?: string | null;
    prBody?: string | null;
  },
) {
  const name = uniq('evalrepo');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Add Stripe billing',
      body: opts.prBody === undefined ? 'Wires up Stripe.' : opts.prBody,
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'cafebabe',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'open',
    })
    .returning();
  if (opts.patch) {
    await db.insert(t.prFiles).values({ prId: pr!.id, path: 'src/config.ts', patch: opts.patch });
  }
  const [rev] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId: pr!.id, agentId: opts.agentId, kind: 'review', score: 50 })
    .returning();
  const [f] = await db
    .insert(t.findings)
    .values({
      reviewId: rev!.id,
      file: 'src/config.ts',
      startLine: 51,
      endLine: 52,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Debug flag left on in production!',
      rationale: 'because',
      confidence: 0.9,
      acceptedAt: opts.decision === 'accepted' ? new Date() : null,
      dismissedAt: opts.decision === 'dismissed' ? new Date() : null,
      ...opts.finding,
    })
    .returning();
  return { repo: repo!, pr: pr!, review: rev!, finding: f! };
}

export async function insertSkill(
  db: Db,
  workspaceId: string,
  name = uniq('skill'),
  body = 'Always check secrets.',
  over: { scanStatus?: 'pending' | 'clean' | 'flagged' | 'error'; scanFindings?: unknown; enabled?: boolean } = {},
) {
  const [s] = await db
    .insert(t.skills)
    .values({
      workspaceId,
      name,
      description: 'd',
      type: 'custom',
      source: 'manual',
      body,
      enabled: over.enabled ?? true,
      scanStatus: over.scanStatus ?? 'clean',
      ...(over.scanFindings !== undefined ? { scanFindings: over.scanFindings as never } : {}),
    })
    .returning();
  await db.insert(t.skillVersions).values({ skillId: s!.id, version: s!.version, body });
  return s!;
}

/** Simulate saving new skill text: bump version + snapshot (no scan, no LLM). */
export async function saveSkillVersion(db: Db, skillId: string, body: string) {
  const [cur] = await db.select().from(t.skills).where(eq(t.skills.id, skillId));
  const version = cur!.version + 1;
  await db.update(t.skills).set({ body, version }).where(eq(t.skills.id, skillId));
  await db.insert(t.skillVersions).values({ skillId, version, body });
  return version;
}

export async function startSkillRun(app: App, skillId: string, draftBody?: string) {
  return app.inject({
    method: 'POST',
    url: `/skills/${skillId}/eval-runs`,
    ...(draftBody !== undefined ? { payload: { draft_body: draftBody } } : {}),
  });
}

export async function linkSkill(db: Db, agentId: string, skillId: string, order = 0) {
  await db.insert(t.agentSkills).values({ agentId, skillId, order });
}

/** Insert a finished skill suite run directly (history / dashboard / compare fixtures). */
export async function insertSkillSuiteRun(
  db: Db,
  workspaceId: string,
  skillId: string,
  over: Partial<typeof t.evalSuiteRuns.$inferInsert> = {},
) {
  const draft = over.isDraft ?? false;
  const [row] = await db
    .insert(t.evalSuiteRuns)
    .values({
      workspaceId,
      ownerKind: 'skill',
      skillId,
      skillVersion: draft ? null : 1,
      isDraft: draft,
      provider: 'openrouter',
      model: 'm1',
      status: 'completed',
      casesTotal: 5,
      casesDone: 5,
      recall: 0.8,
      precision: 0.8,
      citationAccuracy: 0.9,
      passedCount: 4,
      evaluatedCount: 5,
      erroredCount: 0,
      durationMs: 1000,
      costUsd: 0.1,
      startedAt: new Date(),
      finishedAt: new Date(),
      ...over,
    })
    .returning();
  return row!;
}

export async function countAgentRunsAndReviews(db: Db) {
  const [runs, reviews] = await Promise.all([db.select().from(t.agentRuns), db.select().from(t.reviews)]);
  return { runs: runs.length, reviews: reviews.length };
}

export { eq, inArray };
