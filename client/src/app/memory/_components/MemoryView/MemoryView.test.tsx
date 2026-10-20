/* Memory page (SPEC-2026-10-12-memory AC-24..AC-29). fetch is the only API mock. */
import type React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Memory, MemoryListResponse } from "@devdigest/shared";
import { get, mockFetch, post, renderApp } from "@/test/eval-utils";

const nav = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => nav.search,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/contexts", () => ({ useActiveRepo: () => ({ repoId: "r1", reposLoaded: true }) }));

import { MemoryView } from "./MemoryView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.search = new URLSearchParams();
});

const mem = (over: Partial<Memory> = {}): Memory => ({
  id: "m1",
  content: "bucketKey() must include the API version prefix.",
  kind: "fact",
  scope: "repo",
  repo_id: "r1",
  confidence: 0.84,
  sources: [{ pr: 482, context: "finding: bucket collision" }],
  path_globs: ["src/middleware/**"],
  links: [{ target_kind: "agent", target_id: "a1", name: "Security Reviewer" }],
  applies_to_all_agents: false,
  unlinked: false,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-29T00:00:00.000Z",
  last_used_at: null,
  archived_at: null,
  stale: false,
  merged_into: null,
  kept_at: null,
  ...over,
});

const list = (items: Memory[], over: Partial<MemoryListResponse> = {}): MemoryListResponse => ({
  items,
  counts: { scope: { repo: items.length }, kind: { fact: items.length } },
  search_mode: "text",
  ...over,
});

function routes(items: Memory[], over: Partial<MemoryListResponse> = {}) {
  return mockFetch([
    get(/^\/memories\?/, () => list(items, over)),
    get("/memories", () => list(items, over)),
    get("/agents", () => []),
    get(/^\/skills/, () => []),
  ]);
}

describe("MemoryView", () => {
  it("lists memories for the active repo; stale hidden by default, shown with toggle", async () => {
    const api = routes([mem()]);
    renderApp(<MemoryView />);
    expect(await screen.findByText("bucketKey() must include the API version prefix.")).toBeTruthy();
    const first = new URLSearchParams(api.calls.find((c) => c.path.startsWith("/memories"))!.path.split("?")[1]);
    expect(first.get("repo_id")).toBe("r1");
    expect(first.get("stale")).toBeNull();

    fireEvent.click(screen.getByRole("checkbox", { name: "Show stale (>60d)" }));
    await waitFor(() => expect(api.calls.some((c) => c.path.includes("stale=true"))).toBe(true));
  });

  it("search shows semantic badge from response and sends q", async () => {
    const api = routes([mem()], { search_mode: "semantic" });
    renderApp(<MemoryView />);
    fireEvent.change(await screen.findByPlaceholderText("Search memory…"), { target: { value: "redis" } });
    await waitFor(() => expect(api.calls.some((c) => c.path.includes("q=redis"))).toBe(true));
    expect(await screen.findByText("semantic")).toBeTruthy();
  });

  it("kind filter hides unchecked kinds client-side", async () => {
    routes([mem(), mem({ id: "m2", kind: "learning", content: "Do not flag JSON.parse try/catch." })]);
    renderApp(<MemoryView />);
    await screen.findByText("Do not flag JSON.parse try/catch.");
    fireEvent.click(screen.getByRole("checkbox", { name: /^learning/ }));
    expect(screen.queryByText("Do not flag JSON.parse try/catch.")).toBeNull();
    expect(screen.getByText("bucketKey() must include the API version prefix.")).toBeTruthy();
  });

  it("selecting a card opens detail with source PR chips and links", async () => {
    routes([mem()]);
    renderApp(<MemoryView />);
    fireEvent.click(await screen.findByText("bucketKey() must include the API version prefix."));
    const detail = await screen.findByTestId("memory-detail");
    expect(within(detail).getByText("PR #482")).toBeTruthy();
    expect(within(detail).getByText("Security Reviewer")).toBeTruthy();
    expect(within(detail).getByText("84%")).toBeTruthy();
    expect(within(detail).getByText("src/middleware/**")).toBeTruthy();
  });

  it("?id= preselects the memory (Learned link)", async () => {
    nav.search = new URLSearchParams("id=m1");
    routes([mem()]);
    renderApp(<MemoryView />);
    expect(await screen.findByTestId("memory-detail")).toBeTruthy();
  });

  it("FIX: ?id= opens a memory that is not in the current list (archived / other repo)", async () => {
    nav.search = new URLSearchParams("id=m7");
    const api = routes([]);
    api.on("GET", "/memories/m7", () => mem({ id: "m7", content: "Archived elsewhere.", archived_at: "2026-10-01T00:00:00.000Z" }));
    renderApp(<MemoryView />);
    const detail = await screen.findByTestId("memory-detail");
    expect(within(detail).getByText("Archived elsewhere.")).toBeTruthy();
  });

  it("Delete asks confirmation then calls DELETE", async () => {
    const api = routes([mem()]);
    api.on("DELETE", "/memories/m1", () => ({}));
    renderApp(<MemoryView />);
    fireEvent.click(await screen.findByText("bucketKey() must include the API version prefix."));
    fireEvent.click(within(await screen.findByTestId("memory-detail")).getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this memory? Agents will stop using it.")).toBeTruthy();
    expect(api.callsTo("DELETE", "/memories/m1")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(api.callsTo("DELETE", "/memories/m1")).toHaveLength(1));
  });

  it("Archive sends PATCH archived=true", async () => {
    const api = routes([mem()]);
    api.on("PATCH", "/memories/m1", () => mem({ archived_at: "2026-10-12T00:00:00.000Z" }));
    renderApp(<MemoryView />);
    fireEvent.click(await screen.findByText("bucketKey() must include the API version prefix."));
    fireEvent.click(within(await screen.findByTestId("memory-detail")).getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(api.callsTo("PATCH", "/memories/m1")[0]?.body).toEqual({ archived: true }));
  });

  it("Unlinked memory shows Unlinked badge", async () => {
    routes([mem({ links: [], unlinked: true })]);
    renderApp(<MemoryView />);
    expect(await screen.findByText("Unlinked")).toBeTruthy();
  });

  it("empty state text from memory.json", async () => {
    routes([]);
    renderApp(<MemoryView />);
    expect(await screen.findByText("No memory matches")).toBeTruthy();
    expect(screen.getByText(/created by the 'Learn' action/)).toBeTruthy();
  });
  // SPEC-2026-10-12-memory-curation AC-C1: nothing scans until the user clicks Curate.
  it("clicking Curate opens the drawer; nothing is scanned before the click", async () => {
    const api = mockFetch([
      get(/^\/memories\?/, () => list([mem()])),
      get("/agents", () => []),
      get(/^\/skills/, () => []),
      post("/memories/curate/scan", () => ({ groups: [], stale: [], totals: { groups: 0, stale: 0 }, mode: "text" })),
    ]);
    renderApp(<MemoryView />);
    await screen.findByText("bucketKey() must include the API version prefix.");
    expect(api.calls.some((c) => c.path === "/memories/curate/scan")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Curate" }));
    expect(await screen.findByText("Memory looks clean")).toBeTruthy();
    expect(api.calls.filter((c) => c.path === "/memories/curate/scan")).toHaveLength(1);
  });
});
