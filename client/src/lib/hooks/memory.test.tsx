/* SPEC-2026-10-12-memory client hooks. `fetch` is the only mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateMemory, useDeleteMemory, useMemories, useSimilarMemories } from "./memory";
import { get, mockFetch, post } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const invalidated = (qc: QueryClient, key: unknown[]) => qc.getQueryState(key)?.isInvalidated === true;
const EMPTY_LIST = { items: [], counts: { scope: {}, kind: {} }, search_mode: "text" };

describe("useMemories", () => {
  it("builds the query string from the filters (omitting unset ones)", async () => {
    const api = mockFetch([get(/^\/memories\?/, () => EMPTY_LIST)]);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useMemories({ repo_id: "00000000-0000-4000-8000-000000000001", kind: "fact", stale: true, q: "redis" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const path = api.calls[0]!.path;
    expect(path.startsWith("/memories?")).toBe(true);
    const qs = new URLSearchParams(path.split("?")[1]);
    expect(Object.fromEntries(qs)).toEqual({
      repo_id: "00000000-0000-4000-8000-000000000001",
      kind: "fact",
      stale: "true",
      q: "redis",
    });
  });
});

describe("useCreateMemory", () => {
  it("invalidates memories and the reviews that show the Learned state", async () => {
    mockFetch([post("/memories", () => ({ id: "m1" }))]);
    const { qc, wrapper } = setup();
    qc.setQueryData(["memories", {}], EMPTY_LIST);
    qc.setQueryData(["reviews", "p1"], []);
    qc.setQueryData(["multi-agent-run", "r1"], {});
    const { result } = renderHook(() => useCreateMemory(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        content: "c",
        kind: "fact",
        scope: "global",
        repo_id: null,
        path_globs: [],
        links: [],
        applies_to_all_agents: true,
        confidence: 0.8,
      });
    });
    expect(invalidated(qc, ["memories", {}])).toBe(true);
    expect(invalidated(qc, ["reviews", "p1"])).toBe(true);
    expect(invalidated(qc, ["multi-agent-run", "r1"])).toBe(true);
  });
});

describe("useDeleteMemory", () => {
  it("removes the detail and invalidates lists", async () => {
    mockFetch([{ method: "DELETE", match: "/memories/m1", respond: () => ({}) }]);
    const { qc, wrapper } = setup();
    qc.setQueryData(["memory", "m1"], { id: "m1" });
    qc.setQueryData(["memories", {}], EMPTY_LIST);
    const { result } = renderHook(() => useDeleteMemory(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("m1");
    });
    expect(qc.getQueryData(["memory", "m1"])).toBeUndefined();
    expect(invalidated(qc, ["memories", {}])).toBe(true);
  });
});

describe("useSimilarMemories", () => {
  it("makes no request under 20 chars", async () => {
    const api = mockFetch([get(/^\/memories\/similar/, () => [])]);
    const { wrapper } = setup();
    renderHook(() => useSimilarMemories("too short", null), { wrapper });
    await new Promise((r) => setTimeout(r, 500));
    expect(api.calls).toHaveLength(0);
  });

  it("debounces and then queries with content + repo_id", async () => {
    const api = mockFetch([get(/^\/memories\/similar/, () => [{ id: "m9", content: "x", kind: "fact", scope: "repo", similarity: 0.9 }])]);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useSimilarMemories("bucketKey must include the API version prefix", "00000000-0000-4000-8000-000000000001"),
      { wrapper },
    );
    expect(api.calls).toHaveLength(0);
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const qs = new URLSearchParams(api.calls[0]!.path.split("?")[1]);
    expect(qs.get("content")).toBe("bucketKey must include the API version prefix");
    expect(qs.get("repo_id")).toBe("00000000-0000-4000-8000-000000000001");
  });
});
