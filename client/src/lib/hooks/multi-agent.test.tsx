/* SPEC-10 client hooks: multi-run polling, start (409 passthrough), cancel
   invalidation, list/estimates. `fetch` is the only mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  MULTI_AGENT_POLL_MS,
  useAgentEstimates,
  useCancelMultiRun,
  useMultiAgentRun,
  useMultiAgentRuns,
  useStartMultiRun,
} from "./multi-agent";
import { usePrRuns } from "./reviews";
import type { MultiAgentRun } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { apiError, get, mockFetch, post } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}
const invalidated = (qc: QueryClient, key: unknown[]) => qc.getQueryState(key)?.isInvalidated === true;
/** Fully fake clock: advance by `ms` and flush resulting promise/notify work. No real sleeps, so
    load on the machine cannot stretch a test past its timeout. */
const tick = async (ms = 0) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};
const run = (in_progress: boolean) => ({ id: "m1", pr_id: "p1", in_progress, columns: [], conflicts: [] });

describe("useMultiAgentRun", () => {
  it("polls every 4s while in_progress and stops once terminal", async () => {
    vi.useFakeTimers();
    let inProgress = true;
    const api = mockFetch([get("/multi-agent-runs/m1", () => run(inProgress))]);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentRun("m1"), { wrapper });
    await tick();
    expect(result.current.isSuccess).toBe(true);
    expect(api.callsTo("GET", "/multi-agent-runs/m1")).toHaveLength(1);

    await tick(MULTI_AGENT_POLL_MS);
    expect(api.callsTo("GET", "/multi-agent-runs/m1")).toHaveLength(2);

    inProgress = false;
    await tick(MULTI_AGENT_POLL_MS);
    expect(api.callsTo("GET", "/multi-agent-runs/m1")).toHaveLength(3);
    await tick();
    expect(qc.getQueryData<MultiAgentRun>(["multi-agent-run", "m1"])?.in_progress).toBe(false);

    await tick(MULTI_AGENT_POLL_MS * 3);
    expect(api.callsTo("GET", "/multi-agent-runs/m1")).toHaveLength(3);
  });

  it("does not request without an id", () => {
    const api = mockFetch([]);
    const { wrapper } = setup();
    renderHook(() => useMultiAgentRun(null), { wrapper });
    expect(api.calls).toHaveLength(0);
  });
});

describe("useMultiAgentRuns / useAgentEstimates", () => {
  it("lists with limit and pr_id", async () => {
    const api = mockFetch([get(/^\/multi-agent-runs\?/, () => [])]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useMultiAgentRuns(5, "p1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.calls[0]!.path).toBe("/multi-agent-runs?limit=5&pr_id=p1");
  });

  it("reads estimates", async () => {
    mockFetch([get("/multi-agent-runs/estimates", () => ({ review_concurrency: 3, agents: [] }))]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAgentEstimates(), { wrapper });
    await waitFor(() => expect(result.current.data?.review_concurrency).toBe(3));
  });
});

describe("useStartMultiRun", () => {
  it("posts agentIds and invalidates the PR's run caches", async () => {
    const api = mockFetch([post("/pulls/p1/review", () => ({ pr_id: "p1", runs: [], reviews: [], multi_agent_run_id: "m1" }))]);
    const { qc, wrapper } = setup();
    qc.setQueryData(["pr-active-runs", "p1"], []);
    qc.setQueryData(["pr-runs", "p1"], []);
    qc.setQueryData(["pr-runs", "other"], []);
    const { result } = renderHook(() => useStartMultiRun(), { wrapper });
    let res: { multi_agent_run_id?: string | null } | undefined;
    await act(async () => { res = await result.current.mutateAsync({ prId: "p1", agentIds: ["a", "b"] }); });
    expect(res?.multi_agent_run_id).toBe("m1");
    expect(api.calls[0]!.body).toEqual({ agentIds: ["a", "b"] });
    expect(invalidated(qc, ["pr-active-runs", "p1"])).toBe(true);
    expect(invalidated(qc, ["pr-runs", "p1"])).toBe(true);
    expect(invalidated(qc, ["pr-runs", "other"])).toBe(false);
  });

  it("surfaces a 409 review_in_progress with details on the ApiError", async () => {
    mockFetch([post("/pulls/p1/review", () => apiError(409, "busy", { run_ids: ["r1"], multi_agent_run_id: "m9" }, "review_in_progress"))]);
    const { wrapper } = setup();
    const { result } = renderHook(() => useStartMultiRun(), { wrapper });
    await act(async () => { result.current.mutate({ prId: "p1", agentIds: ["a"] }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    const err = result.current.error as ApiError;
    expect(err.status).toBe(409);
    expect(err.code).toBe("review_in_progress");
    expect(err.details).toEqual({ run_ids: ["r1"], multi_agent_run_id: "m9" });
  });
});

describe("useCancelMultiRun", () => {
  it("invalidates the run, lists and PR run caches", async () => {
    mockFetch([post("/multi-agent-runs/m1/cancel", () => ({ cancelled_run_ids: ["r1"] }))]);
    const { qc, wrapper } = setup();
    qc.setQueryData(["multi-agent-run", "m1"], run(true));
    qc.setQueryData(["multi-agent-runs", null, 10], []);
    qc.setQueryData(["pr-active-runs", "p1"], []);
    const { result } = renderHook(() => useCancelMultiRun(), { wrapper });
    await act(async () => { await result.current.mutateAsync("m1"); });
    expect(invalidated(qc, ["multi-agent-run", "m1"])).toBe(true);
    expect(invalidated(qc, ["multi-agent-runs", null, 10])).toBe(true);
    expect(invalidated(qc, ["pr-active-runs", "p1"])).toBe(true);
  });
});

describe("usePrRuns", () => {
  it("keeps polling while a run is queued", async () => {
    vi.useFakeTimers();
    const api = mockFetch([get("/pulls/p1/runs", () => [{ run_id: "r1", status: "queued" }])]);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrRuns("p1"), { wrapper });
    await tick();
    expect(result.current.isSuccess).toBe(true);
    await tick(MULTI_AGENT_POLL_MS);
    expect(api.callsTo("GET", "/pulls/p1/runs").length).toBeGreaterThan(1);
  });
});
