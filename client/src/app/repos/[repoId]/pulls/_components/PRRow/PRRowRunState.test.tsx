/* PRRow in-place run state (SPEC-05 C-AC-15, C-AC-25, C-AC-26, C-AC-27): the
   row watches its own active runs, and on settle refreshes the list and checks
   the run history for a failure. Real hooks; `fetch` is the only mock. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, act, waitFor } from "@testing-library/react";
import type { PrMeta } from "@/lib/types";
import { get, mockFetch, post, renderApp } from "@/test/eval-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const PR = {
  id: "pr1", number: 7, title: "Fix the thing", author: "a", avatar_url: null, branch: "b", base: "main",
  head_sha: "sha", additions: 5, deletions: 5, files_count: 1, status: "needs_review", opened_at: null,
  updated_at: null, score: null, cost_usd: null, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
} as unknown as PrMeta;

const run = (over: Record<string, unknown>) => ({
  run_id: "x", agent_id: "a1", agent_name: "Agent", pr_number: 7, provider: null, model: null, status: "done",
  error: null, duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0.01, findings_count: 0, grounding: null,
  ran_at: "2026-10-07T10:00:00.000Z", score: 80, blockers: 0, ...over,
});

function setup(history: unknown[]) {
  let active: unknown[] = [{ run_id: "x", agent_id: "a1", agent_name: "Agent", ran_at: null }];
  const api = mockFetch([
    get("/pulls/pr1/runs/active", () => active),
    get("/pulls/pr1/runs", () => history),
    get("/agents", () => []),
    post("/pulls/pr1/review", () => ({ pr_id: "pr1", runs: [], reviews: [] })),
  ]);
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const view = renderApp(<PRRow pr={PR} repoId="repo1" />);
  view.queryClient.setQueryData(["pulls", "repo1"], [PR]);
  const settle = async () => {
    active = [];
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
  };
  return { api, settle, ...view };
}

describe("PRRow run state", () => {
  it("F2 / C-AC-14, C-AC-15: shows in-progress, makes no run-history request before settle, then refreshes the list", async () => {
    const { api, settle, queryClient } = setup([run({ status: "done" })]);
    expect(await screen.findByText("Running…")).toBeInTheDocument();
    expect(api.callsTo("GET", "/pulls/pr1/runs")).toHaveLength(0);

    await settle();

    await waitFor(() => expect(screen.queryByText("Running…")).not.toBeInTheDocument());
    expect(queryClient.getQueryState(["pulls", "repo1"])?.isInvalidated).toBe(true);
    // `waitFor` polls on setInterval (faked here) - flush the fetch with a real timeout instead.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(api.callsTo("GET", "/pulls/pr1/runs")).toHaveLength(1);
    // Newest run succeeded: no failure state.
    expect(screen.queryByText("Failed")).not.toBeInTheDocument();
  });

  it("F2 / C-AC-15, C-AC-25, C-AC-26: when the newest run failed the row says so next to the dropdown", async () => {
    const { settle } = setup([
      run({ run_id: "old", status: "done", ran_at: "2026-10-07T09:00:00.000Z" }),
      run({ run_id: "new", status: "failed", error: "model timeout", ran_at: "2026-10-07T10:00:00.000Z" }),
    ]);
    await screen.findByText("Running…");

    await settle();

    const badge = await screen.findByText("Failed");
    expect(badge.closest("[title]")).toHaveAttribute("title", "Last review run failed: model timeout");
    // The row's own Run Review dropdown is still there for a manual retry.
    expect(screen.getByRole("button", { name: /Run Review for #7/ })).toBeInTheDocument();
  });

  it("F2 / C-AC-27: a failed row is never retried automatically", async () => {
    const { api, settle } = setup([run({ status: "failed", error: "boom" })]);
    await screen.findByText("Running…");
    await settle();
    await screen.findByText("Failed");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(api.callsTo("POST", "/pulls/pr1/review")).toHaveLength(0);
    expect(api.callsTo("GET", "/pulls/pr1/runs")).toHaveLength(1);
  });
});
