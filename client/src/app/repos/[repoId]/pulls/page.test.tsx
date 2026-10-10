/* PR list page + "Review all" connection budget (SPEC-05 C-AC-28, C-AC-29,
   verified as a unit test with a mocked EventSource). Real page, real hooks;
   `fetch` and `EventSource` are the only mocks. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { PrMeta } from "@/lib/types";
import { get, mockFetch, post, renderApp } from "@/test/eval-utils";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/contexts/repoContext", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/api", languages: null }, repos: [], reposLoaded: true }),
  useRepoNotFound: () => false,
}));

import PullsPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const COUNT = 6;
const pr = (n: number) =>
  ({
    id: `pr${n}`, number: n, title: `PR ${n}`, author: "a", avatar_url: null, branch: "b", base: "main",
    head_sha: "sha", additions: 5, deletions: 5, files_count: 1, status: "needs_review", opened_at: null,
    updated_at: null, score: null, cost_usd: null, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  }) as unknown as PrMeta;

describe("PullsPage Review all", () => {
  it("F1 / C-AC-28, C-AC-29: runs started by Review all open no EventSource per run and the list keeps loading", async () => {
    const sources = vi.fn();
    class FakeEventSource {
      constructor(url: string) {
        sources(url);
      }
      addEventListener() {}
      close() {}
    }
    vi.stubGlobal("EventSource", FakeEventSource);

    const pulls = Array.from({ length: COUNT }, (_, i) => pr(i + 1));
    let started = false;
    const api = mockFetch([
      get("/repos/r1/pulls", () => pulls),
      get("/repos/r1/pulls/review-estimate", () => ({
        pr_count: COUNT, agent_count: 2, run_count: COUNT * 2, approx_cost_usd: null, approximate: true, skip_count: 0,
      })),
      post("/repos/r1/pulls/review", () => {
        started = true;
        return { results: pulls.map((p) => ({ pr_id: p.id, outcome: "started", run_ids: [`run-${p.id}`] })) };
      }),
      get(/^\/pulls\/pr\d+\/runs\/active$/, () =>
        started ? [{ run_id: "x", agent_id: "a1", agent_name: "Agent", ran_at: null }] : [],
      ),
      get(/^\/pulls\/pr\d+\/runs$/, () => []),
      get("/agents", () => []),
    ]);

    renderApp(<PullsPage />);
    fireEvent.click(await screen.findByRole("button", { name: `Review all (${COUNT})` }));
    await screen.findByText(/review runs/);
    fireEvent.click(screen.getByRole("button", { name: "Start reviews" }));

    // Every row flips to its in-progress state via the bounded poll...
    await waitFor(() => expect(screen.getAllByText("Running…")).toHaveLength(COUNT));
    // ...the list itself was re-requested and completed (C-AC-29)...
    await waitFor(() => expect(api.callsTo("GET", "/repos/r1/pulls").length).toBeGreaterThanOrEqual(2));
    expect(screen.getAllByText(/^PR \d$/)).toHaveLength(COUNT);
    // ...and not one SSE connection was opened for any run (C-AC-28).
    expect(sources).not.toHaveBeenCalled();
  });
});
