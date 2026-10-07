/* SPEC-05 client hooks: useRunReview invalidation (C-AC-14), useReviewEstimate,
   useBulkReview (C-AC-24/25). `fetch` is the only mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useBulkReview, useReviewEstimate, useRunReview } from "./reviews";
import { get, mockFetch, post } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
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

describe("useRunReview", () => {
  it("F2 / C-AC-14: a started run invalidates pr-active-runs and pr-runs so the row shows in-progress", async () => {
    mockFetch([post("/pulls/p1/review", () => ({ pr_id: "p1", runs: [], reviews: [] }))]);
    const { qc, wrapper } = setup();
    qc.setQueryData(["pr-active-runs", "p1"], []);
    qc.setQueryData(["pr-runs", "p1"], []);
    qc.setQueryData(["pr-active-runs", "other"], []);
    const { result } = renderHook(() => useRunReview(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ prId: "p1", all: true });
    });

    expect(invalidated(qc, ["pr-active-runs", "p1"])).toBe(true);
    expect(invalidated(qc, ["pr-runs", "p1"])).toBe(true);
    expect(invalidated(qc, ["pr-active-runs", "other"])).toBe(false);
  });
});

describe("useReviewEstimate", () => {
  it("F1 / C-AC-17: makes no request until enabled, then reads the repo's estimate", async () => {
    const api = mockFetch([
      get("/repos/r1/pulls/review-estimate", () => ({
        pr_count: 3, agent_count: 2, run_count: 6, approx_cost_usd: 0.5, approximate: true, skip_count: 0,
      })),
    ]);
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ on }) => useReviewEstimate("r1", on), {
      wrapper,
      initialProps: { on: false },
    });
    expect(api.calls).toHaveLength(0);

    rerender({ on: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.run_count).toBe(6);
    expect(api.callsTo("GET", "/repos/r1/pulls/review-estimate")).toHaveLength(1);
  });
});

describe("useBulkReview", () => {
  it("F1 / C-AC-24, C-AC-25: posts with no body and invalidates only the started PRs plus the list", async () => {
    const api = mockFetch([
      post("/repos/r1/pulls/review", () => ({
        results: [
          { pr_id: "a", outcome: "started", run_ids: ["x"] },
          { pr_id: "b", outcome: "skipped", run_ids: [], reason: "in flight" },
          { pr_id: "c", outcome: "failed", run_ids: [], reason: "boom" },
        ],
      })),
    ]);
    const { qc, wrapper } = setup();
    for (const id of ["a", "b", "c"]) qc.setQueryData(["pr-active-runs", id], []);
    qc.setQueryData(["pulls", "r1"], []);
    const { result } = renderHook(() => useBulkReview("r1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(api.callsTo("POST", "/repos/r1/pulls/review")[0]?.body).toBeUndefined();
    expect(invalidated(qc, ["pr-active-runs", "a"])).toBe(true);
    expect(invalidated(qc, ["pr-active-runs", "b"])).toBe(false);
    expect(invalidated(qc, ["pr-active-runs", "c"])).toBe(false);
    expect(invalidated(qc, ["pulls", "r1"])).toBe(true);
  });
});
