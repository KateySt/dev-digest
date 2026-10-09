/* useSkillEvalActivity — the run controller shared by the Skill Editor header,
   its Evals tab and the per-skill dashboard (SPEC-08 SK-2, SK-3, SK-6, SK-13,
   SK-15, SK-16, SK-17 and the "switching skills keeps polling" edge case).
   `fetch` is the only mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSkillEvalActivity } from "./eval-runs";
import { apiError, evalCase, get, mockFetch, post, skillEvalRuns, skillRun, skillRunDetail } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CASES = [evalCase({ id: "c1", owner_kind: "skill", owner_id: "sk1" }), evalCase({ id: "c2", owner_kind: "skill", owner_id: "sk1" })];

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const CLEAN = { scan_status: "clean" as const, scan_findings: null };

function baseRoutes(over: { cases?: unknown; runs?: unknown } = {}) {
  return [
    get(/^\/eval-cases\?owner_kind=skill&owner_id=sk1$/, () => over.cases ?? CASES),
    get(/^\/skills\/sk1\/eval-runs/, () => over.runs ?? skillEvalRuns()),
    get(/^\/eval-cases\?owner_kind=skill&owner_id=sk2$/, () => []),
    get(/^\/skills\/sk2\/eval-runs/, () => skillEvalRuns()),
  ];
}

describe("useSkillEvalActivity: gating", () => {
  it("SK-17: with no cases, running is disabled with the 'noCases' reason; with cases it is allowed", async () => {
    mockFetch(baseRoutes({ cases: [] }));
    const empty = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(empty.result.current.disabledReason).toEqual({ kind: "noCases" }));
    expect(empty.result.current.caseCount).toBe(0);
    cleanup();

    mockFetch(baseRoutes());
    const full = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(full.result.current.caseCount).toBe(2));
    expect(full.result.current.disabledReason).toBeNull();
    expect(full.result.current.running).toBe(false);
    expect(full.result.current.progress).toBeNull();
  });

  it("SK-17: while the cases are still loading it does NOT claim 'no cases'", () => {
    mockFetch(baseRoutes());
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    expect(result.current.disabledReason).toBeNull();
  });

  it.each([
    ["pending", null],
    ["error", null],
    ["flagged", [{ severity: "critical", category: "exfiltration", excerpt: "x", location: "l", explanation: "e" }]],
    ["flagged", [{ severity: "high", category: "exfiltration", excerpt: "x", location: "l", explanation: "e" }]],
  ] as const)("SK-15: a %s scan (%j findings) blocks runs with a scan reason, ahead of every other reason", async (status, findings) => {
    mockFetch(baseRoutes({ cases: [] }));
    const { result } = renderHook(
      () => useSkillEvalActivity("sk1", { scan_status: status, scan_findings: findings as never }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.disabledReason).toEqual({ kind: "scan", status }));
  });

  it("SK-15: a flagged scan with only low/medium findings does not block; clean never blocks; an unknown scan state (skill still loading) gates nothing", async () => {
    mockFetch(baseRoutes());
    const soft = renderHook(
      () =>
        useSkillEvalActivity("sk1", {
          scan_status: "flagged",
          scan_findings: [{ severity: "low", category: "other", excerpt: "x", location: "l", explanation: "e" }] as never,
        }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(soft.result.current.caseCount).toBe(2));
    expect(soft.result.current.disabledReason).toBeNull();
    cleanup();

    mockFetch(baseRoutes());
    const unknown = renderHook(() => useSkillEvalActivity("sk1"), { wrapper: wrapper() });
    await waitFor(() => expect(unknown.result.current.caseCount).toBe(2));
    expect(unknown.result.current.disabledReason).toBeNull();
  });
});

describe("useSkillEvalActivity: starting and polling", () => {
  it("SK-3: start() without text posts no body (a normal versioned run); with text it posts draft_body and the run is a draft", async () => {
    const net = mockFetch([
      ...baseRoutes(),
      post("/skills/sk1/eval-runs", (c) => ({ run_id: "run-9", status: "running", cases_total: 2, is_draft: !!(c.body as { draft_body?: string } | undefined)?.draft_body })),
      get("/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 2 })),
    ]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.caseCount).toBe(2));

    act(() => result.current.start());
    await waitFor(() => expect(net.callsTo("POST", "/skills/sk1/eval-runs")).toHaveLength(1));
    expect(net.callsTo("POST", "/skills/sk1/eval-runs")[0]!.body).toBeUndefined();
    await waitFor(() => expect(result.current.running).toBe(true));
    cleanup();

    const net2 = mockFetch([
      ...baseRoutes(),
      post("/skills/sk1/eval-runs", () => ({ run_id: "run-10", status: "running", cases_total: 2, is_draft: true })),
      get("/eval-suite-runs/run-10", () => skillRunDetail({ id: "run-10", is_draft: true, skill_version: null, status: "running", cases_total: 2 })),
    ]);
    const draft = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(draft.result.current.caseCount).toBe(2));
    act(() => draft.result.current.start("unsaved text"));
    await waitFor(() => expect(net2.callsTo("POST", "/skills/sk1/eval-runs")).toHaveLength(1));
    expect(net2.callsTo("POST", "/skills/sk1/eval-runs")[0]!.body).toEqual({ draft_body: "unsaved text" });
    // The running draft is exposed through `draft` so the Evals tab can render it.
    await waitFor(() => expect(draft.result.current.draft?.id).toBe("run-10"));
  });

  it("SK-13: reports progress while running, disables starting with the 'running' reason, polls every 2s and stops (and clears progress) when the run ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let detail = skillRunDetail({ id: "run-9", status: "running", cases_done: 1, cases_total: 2 });
    const net = mockFetch([
      ...baseRoutes(),
      post("/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 2, is_draft: false })),
      get("/eval-suite-runs/run-9", () => detail),
    ]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await vi.waitFor(() => expect(result.current.caseCount).toBe(2));

    act(() => result.current.start());
    await vi.waitFor(() => expect(result.current.progress).toEqual({ done: 1, total: 2 }));
    expect(result.current.running).toBe(true);
    expect(result.current.disabledReason).toEqual({ kind: "running" });

    detail = skillRunDetail({ id: "run-9", status: "running", cases_done: 2, cases_total: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => expect(result.current.progress).toEqual({ done: 2, total: 2 }));

    detail = skillRunDetail({ id: "run-9", status: "completed", cases_done: 2, cases_total: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => expect(result.current.running).toBe(false));
    expect(result.current.progress).toBeNull();
    expect(result.current.disabledReason).toBeNull();

    // polling stops once the run is no longer running
    const settled = net.callsTo("GET", "/eval-suite-runs/run-9").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(net.callsTo("GET", "/eval-suite-runs/run-9")).toHaveLength(settled);
  });

  it("SK-14: when the run finishes the skill's cases are refetched (a case count change shows up without a reload)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let detail = skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 2 });
    let cases = CASES;
    mockFetch([
      get(/^\/eval-cases\?owner_kind=skill&owner_id=sk1$/, () => cases),
      get(/^\/skills\/sk1\/eval-runs/, () => skillEvalRuns()),
      post("/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 2, is_draft: false })),
      get("/eval-suite-runs/run-9", () => detail),
    ]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await vi.waitFor(() => expect(result.current.caseCount).toBe(2));
    act(() => result.current.start());
    await vi.waitFor(() => expect(result.current.running).toBe(true));

    cases = [...CASES, evalCase({ id: "c3", owner_kind: "skill", owner_id: "sk1" })];
    detail = skillRunDetail({ id: "run-9", status: "completed", cases_done: 2, cases_total: 2 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => expect(result.current.caseCount).toBe(3));
    expect(result.current.running).toBe(false);
  });

  it("SK-13: between the start request succeeding and the run's first status arriving the controller already counts as running (no window where starting is re-enabled)", async () => {
    mockFetch([
      ...baseRoutes(),
      post("/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 2, is_draft: false })),
      get("/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 2 })),
    ]);
    // Hold back the first GET /eval-suite-runs/:id so the in-between state is observable.
    const real = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/eval-suite-runs/") ? gate.then(() => real(input, init)) : real(input, init),
    );

    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.caseCount).toBe(2));
    act(() => result.current.start());
    // POST resolves immediately; the first GET /eval-suite-runs/:id is still held back.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(result.current.running).toBe(true);
    expect(result.current.disabledReason).toEqual({ kind: "running" });

    release();
    await waitFor(() => expect(result.current.progress).toEqual({ done: 0, total: 2 }));
  });

  it("SK-16: a refused start surfaces the server's message and starts no polling", async () => {
    const net = mockFetch([
      ...baseRoutes(),
      post("/skills/sk1/eval-runs", () => apiError(409, "A run is already in progress for this skill.", undefined, "conflict")),
    ]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.caseCount).toBe(2));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.startError).toBe("A run is already in progress for this skill."));
    expect(result.current.running).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(net.calls.filter((c) => c.path.startsWith("/eval-suite-runs/"))).toHaveLength(0);
  });

  it("SK-16: scan-gated and no-case refusals show their server message too", async () => {
    mockFetch([...baseRoutes(), post("/skills/sk1/eval-runs", () => apiError(400, "Skill scan has not passed.", undefined, "scan_not_passed"))]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.caseCount).toBe(2));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.startError).toBe("Skill scan has not passed."));
  });
});

describe("useSkillEvalActivity: state that comes from the server", () => {
  it("SK-13: a run the server still reports as running (suite or draft) is picked up after a reload, with its progress", async () => {
    const running = skillRun({ id: "run-7", status: "running", cases_done: 1, cases_total: 3, recall: null, precision: null, citation_accuracy: null });
    mockFetch([
      ...baseRoutes({ runs: skillEvalRuns({ runs: [running], history: [] }) }),
      get("/eval-suite-runs/run-7", () => skillRunDetail({ ...running })),
    ]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.running).toBe(true));
    expect(result.current.progress).toEqual({ done: 1, total: 3 });
    expect(result.current.disabledReason).toEqual({ kind: "running" });
  });

  it("SK-13: a draft run the server reports as running also disables starting", async () => {
    const draft = skillRunDetail({ id: "d-1", is_draft: true, skill_version: null, status: "running", cases_done: 0, cases_total: 2 });
    mockFetch([
      ...baseRoutes({ runs: skillEvalRuns({ latest_draft: draft }) }),
      get("/eval-suite-runs/d-1", () => draft),
    ]);
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.disabledReason).toEqual({ kind: "running" }));
    expect(result.current.draft?.id).toBe("d-1");
  });

  it("SK-6: the latest draft run returned by the server is exposed as `draft` after a reload (and a finished one does not disable starting)", async () => {
    const draft = skillRunDetail({ id: "d-2", is_draft: true, skill_version: null, status: "completed" });
    mockFetch(baseRoutes({ runs: skillEvalRuns({ latest_draft: draft }) }));
    const { result } = renderHook(() => useSkillEvalActivity("sk1", CLEAN), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.draft?.id).toBe("d-2"));
    expect(result.current.running).toBe(false);
    expect(result.current.disabledReason).toBeNull();
  });
});

describe("useSkillEvalActivity: switching skills", () => {
  it("never shows (or blocks) another skill with the first skill's run, but keeps polling the original run in the background", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const net = mockFetch([
      ...baseRoutes(),
      post("/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 2, is_draft: false })),
      get("/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 1, cases_total: 2 })),
    ]);
    const { result, rerender } = renderHook(({ id }: { id: string }) => useSkillEvalActivity(id, CLEAN), {
      wrapper: wrapper(),
      initialProps: { id: "sk1" },
    });
    await vi.waitFor(() => expect(result.current.caseCount).toBe(2));
    act(() => result.current.start());
    await vi.waitFor(() => expect(result.current.running).toBe(true));

    rerender({ id: "sk2" });
    await vi.waitFor(() => expect(net.callsTo("GET", /owner_id=sk2/).length).toBeGreaterThan(0));
    expect(result.current.running).toBe(false);
    expect(result.current.progress).toBeNull();

    const before = net.callsTo("GET", "/eval-suite-runs/run-9").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => expect(net.callsTo("GET", "/eval-suite-runs/run-9").length).toBeGreaterThan(before));
  });
});
