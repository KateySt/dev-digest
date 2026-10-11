/* Shared helpers for the Evals feature tests: a tiny `fetch` router (the only
   mocked boundary), a fresh-QueryClient + next-intl render wrapper, and
   fixture builders for the shared eval contracts. */
import React from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Agent,
  AgentEvalStats,
  EvalCaseListItem,
  EvalCaseRun,
  EvalSuiteRun,
  FindingRecord,
  Skill,
  SkillEvalRuns,
  SkillEvalSuiteRun,
  SkillEvalSuiteRunDetail,
} from "@devdigest/shared";
import evalMessages from "../../messages/en/eval.json";
import evalAgentMessages from "../../messages/en/evalAgent.json";
import evalDashboardMessages from "../../messages/en/evalDashboard.json";
import evalMetricsMessages from "../../messages/en/evalMetrics.json";
import evalSkillMessages from "../../messages/en/evalSkill.json";
import prReviewMessages from "../../messages/en/prReview.json";
import shellMessages from "../../messages/en/shell.json";
import skillsMessages from "../../messages/en/skills.json";

export const ALL_MESSAGES = {
  eval: evalMessages,
  evalAgent: evalAgentMessages,
  evalDashboard: evalDashboardMessages,
  evalMetrics: evalMetricsMessages,
  evalSkill: evalSkillMessages,
  prReview: prReviewMessages,
  shell: shellMessages,
  skills: skillsMessages,
};

// ---- fetch router ----------------------------------------------------------

export interface FetchCall {
  method: string;
  path: string;
  body: unknown;
}

type Responder = (call: FetchCall) => unknown | { __status: number; body: unknown };
interface Route {
  method: string;
  match: string | RegExp;
  respond: Responder;
}

/** Respond with a non-200 status (the body is wrapped like the API's error envelope by the caller). */
export const status = (code: number, body: unknown) => ({ __status: code, body });
export const apiError = (code: number, message: string, details?: unknown, errCode = "error") =>
  status(code, { error: { code: errCode, message, details } });

/**
 * Stub `fetch` with an ordered route table (first match wins). Responders may
 * be re-pointed between steps via the returned `routes` array (unshift a new
 * route to override). Unmatched requests fail loudly with a 404 so a missing
 * route shows up as a test failure, not a hang.
 */
export function mockFetch(initial: Route[] = []) {
  const routes: Route[] = [...initial];
  const calls: FetchCall[] = [];

  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname + url.search;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call: FetchCall = { method, path, body };
    calls.push(call);
    const route = routes.find(
      (r) => r.method === method && (typeof r.match === "string" ? path === r.match || url.pathname === r.match : r.match.test(path)),
    );
    if (!route) return jsonResponse(404, { error: { code: "no_route", message: `no mock route for ${method} ${path}` } });
    const out = route.respond(call) as { __status?: number; body?: unknown } | undefined;
    if (out && typeof out === "object" && "__status" in out) return jsonResponse(out.__status!, out.body);
    return jsonResponse(200, out ?? {});
  });
  vi.stubGlobal("fetch", impl);

  return {
    routes,
    calls,
    /** Add/override a route (takes precedence over earlier ones). */
    on(method: string, match: string | RegExp, respond: Responder) {
      routes.unshift({ method, match, respond });
    },
    callsTo(method: string, match: string | RegExp) {
      return calls.filter(
        (c) => c.method === method && (typeof match === "string" ? c.path === match || c.path.startsWith(`${match}?`) : match.test(c.path)),
      );
    },
  };
}

function jsonResponse(statusCode: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { "content-type": "application/json" },
  });
}

export const get = (match: string | RegExp, respond: Responder): Route => ({ method: "GET", match, respond });
export const post = (match: string | RegExp, respond: Responder): Route => ({ method: "POST", match, respond });
export const put = (match: string | RegExp, respond: Responder): Route => ({ method: "PUT", match, respond });

// ---- render ----------------------------------------------------------------

export function renderApp(
  ui: React.ReactElement,
  opts: { queryClient?: QueryClient } = {},
): ReturnType<typeof render> & { queryClient: QueryClient } {
  const queryClient =
    opts.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={ALL_MESSAGES}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

// ---- fixtures --------------------------------------------------------------

export function suiteRun(over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id: "run-1",
    agent_id: "ag1",
    agent_version: 1,
    status: "completed",
    failure_reason: null,
    started_at: "2026-06-01T09:14:00.000Z",
    finished_at: "2026-06-01T09:15:00.000Z",
    cases_total: 5,
    cases_done: 5,
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.9,
    passed_count: 4,
    evaluated_count: 5,
    errored_count: 0,
    duration_ms: 60000,
    cost_usd: 0.1,
    ...over,
  };
}

export function caseRun(over: Partial<EvalCaseRun> = {}): EvalCaseRun {
  return {
    id: "cr-1",
    case_id: "case-1",
    ran_at: "2026-06-01T09:14:00.000Z",
    actual_output: [],
    pass: true,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    duration_ms: 1800,
    cost_usd: 0.02,
    suite_run_id: "run-1",
    status: "ok",
    error: null,
    ...over,
  };
}

export function evalCase(over: Partial<EvalCaseListItem> = {}): EvalCaseListItem {
  return {
    id: "case-1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "stripe-key-leak",
    input_diff: "",
    input_files: null,
    input_meta: null,
    expected_output: [{ file: "src/config.ts", start_line: 11, end_line: 11, severity: "CRITICAL", category: "security" }],
    notes: null,
    kind: "must_find",
    source: "manual",
    source_finding_id: null,
    last_run: null,
    ...over,
  };
}

export function stats(over: Partial<AgentEvalStats> = {}): AgentEvalStats {
  return {
    cases_total: 2,
    cases_evaluated: 2,
    recall: 0.82,
    precision: 0.9,
    citation_accuracy: 0.75,
    delta: { recall: 0.04, precision: -0.02, citation_accuracy: 0 },
    traces_passed: 17,
    traces_evaluated: 20,
    latest_run: suiteRun(),
    case_results: [],
    ...over,
  };
}

export function agent(over: Partial<Agent> = {}): Agent {
  return {
    id: "ag1",
    name: "Security Reviewer",
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "You are a reviewer.",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: false,
    attached_doc_paths: [],
    enabled: true,
    version: 3,
    ...over,
  };
}

export function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 11,
    end_line: 12,
    rationale: "A live Stripe key is committed in source.",
    suggestion: "Move the key to an environment variable.",
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

// ---- skill fixtures (SPEC-08) -------------------------------------------------

/** A finished (by default) non-draft skill suite run. */
export function skillRun(over: Partial<SkillEvalSuiteRun> = {}): SkillEvalSuiteRun {
  return {
    id: "srun-1",
    owner_kind: "skill",
    skill_id: "sk1",
    skill_version: 1,
    is_draft: false,
    provider: "openai",
    model: "gpt-4.1",
    status: "completed",
    failure_reason: null,
    started_at: "2026-06-01T09:14:00.000Z",
    finished_at: "2026-06-01T09:15:00.000Z",
    cases_total: 3,
    cases_done: 3,
    recall: 0.8,
    precision: 0.8,
    citation_accuracy: 0.9,
    passed_count: 2,
    evaluated_count: 3,
    errored_count: 0,
    duration_ms: 60000,
    cost_usd: 0.1,
    ...over,
  };
}

/** A skill run with per-case results (`GET /eval-suite-runs/:id` / `latest_draft`). */
export function skillRunDetail(
  over: Partial<SkillEvalSuiteRunDetail> = {},
): SkillEvalSuiteRunDetail {
  return { ...skillRun(), results: [], ...over };
}

/** `GET /skills/:id/eval-runs` payload; `runs` default to the newest-first view of `history`. */
export function skillEvalRuns(over: Partial<SkillEvalRuns> = {}): SkillEvalRuns {
  const history = over.history ?? [];
  return {
    runs: [...history].reverse(),
    history,
    alert: null,
    cases_total: 3,
    latest_draft: null,
    ...over,
  };
}

export function skill(over: Partial<Skill> = {}): Skill {
  return {
    id: "sk1",
    name: "pr-quality-rubric",
    description: "Rubric for evaluating overall PR quality.",
    type: "rubric",
    source: "manual",
    body: "# PR quality rubric\nPrefer small, single-purpose PRs.",
    enabled: true,
    version: 2,
    scan_status: "clean",
    scan_findings: null,
    scanned_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}
