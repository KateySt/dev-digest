import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrMeta } from "@/lib/types";
import { apiError, get, mockFetch, post, renderApp } from "@/test/eval-utils";
import { ReviewAllDialog } from "./ReviewAllDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pr(n: number): PrMeta {
  return {
    id: `pr${n}`, number: n, title: `PR ${n}`, author: "a", avatar_url: null, branch: "b", base: "main",
    head_sha: "sha", additions: 1, deletions: 1, files_count: 1, status: "needs_review", opened_at: null,
    updated_at: null, score: null, cost_usd: null, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  } as unknown as PrMeta;
}

const EST = { pr_count: 3, agent_count: 2, run_count: 6, approx_cost_usd: 0.42 as number | null, approximate: true, skip_count: 0 };
const estimate = (over: Partial<typeof EST>) => get("/repos/r1/pulls/review-estimate", () => ({ ...EST, ...over }));
const PULLS = [pr(1), pr(2), pr(3)];
const BULK = "/repos/r1/pulls/review";

/** The confirm button exists (disabled) while the estimate loads - wait for the counts first. */
async function confirmWhenReady() {
  await screen.findByText(/review runs/);
  fireEvent.click(screen.getByRole("button", { name: "Start reviews" }));
}

describe("ReviewAllDialog", () => {
  it("F1 / C-AC-17, C-AC-19: shows PR, agent and run counts and an explicitly approximate cost", async () => {
    mockFetch([estimate({})]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    expect(await screen.findByText(/3 pull requests × 2 enabled agents = 6 review runs/)).toBeInTheDocument();
    expect(screen.getByText(/Approximate cost: about \$0\.42/)).toBeInTheDocument();
    expect(screen.getByText(/not an exact price/)).toBeInTheDocument();
  });

  it("F1 / C-AC-20: with no cost history it shows the counts and no dollar figure, never $0.00", async () => {
    mockFetch([estimate({ approx_cost_usd: null })]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    expect(await screen.findByText(/6 review runs/)).toBeInTheDocument();
    expect(screen.getByText(/No cost estimate yet/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("F1 / C-AC-21: states separately how many in-flight PRs will be skipped", async () => {
    mockFetch([estimate({ skip_count: 2 })]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    expect(await screen.findByText(/2 pull requests already have a review running and will be skipped/)).toBeInTheDocument();
  });

  it("F1 / C-AC-21 edge: when every target is in flight it reads as nothing to do and cannot be confirmed", async () => {
    mockFetch([estimate({ skip_count: 3 })]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    expect(await screen.findByText(/Nothing to do/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start reviews" })).toBeDisabled();
  });

  it("F1 edge: zero enabled agents reads differently from an empty PR set and cannot be confirmed", async () => {
    mockFetch([estimate({ agent_count: 0, run_count: 0 })]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    expect(await screen.findByText(/No agents are enabled/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start reviews" })).toBeDisabled();
  });

  it("F1 / C-AC-22: more than 20 PRs refuses with the cap, offers no working confirm, and posts nothing", async () => {
    const api = mockFetch([estimate({ pr_count: 21, run_count: 42 })]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    expect(await screen.findByText(/21 pull requests need review, which exceeds the maximum of 20/)).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Start reviews" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(api.callsTo("POST", BULK)).toHaveLength(0);
  });

  it("F1 / C-AC-22: a server bulk_review_too_large refusal is shown inline and nothing starts", async () => {
    mockFetch([
      estimate({}),
      post(BULK, () => apiError(400, "21 pull requests need review", undefined, "bulk_review_too_large")),
    ]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    await confirmWhenReady();
    expect(await screen.findByText(/now exceeds the maximum of 20\. No review was started/)).toBeInTheDocument();
  });

  it("F1 / C-AC-18: cancel and Escape dismiss without starting any review", async () => {
    const onClose = vi.fn();
    const api = mockFetch([estimate({})]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={onClose} />);
    await screen.findByText(/6 review runs/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.callsTo("POST", BULK)).toHaveLength(0);
  });

  it("F1 / NFR a11y: focus moves inside the dialog on open", async () => {
    mockFetch([estimate({})]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    await screen.findByText(/6 review runs/);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
  });

  it("F1 / NFR a11y: Tab from the last control wraps to the first, Shift+Tab from the first wraps to the last", async () => {
    mockFetch([estimate({})]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    await screen.findByText(/6 review runs/);
    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Start reviews" });
    expect(last).toBeEnabled();

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("F1 / NFR a11y: the Escape listener is not re-subscribed when the parent re-renders with a new inline onClose", async () => {
    mockFetch([estimate({})]);
    const closed = vi.fn();
    function Harness() {
      const [n, setN] = React.useState(0);
      return (
        <>
          <span data-testid="n">{n}</span>
          <button onClick={() => setN(n + 1)}>bump</button>
          <ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => closed(n)} />
        </>
      );
    }
    renderApp(<Harness />);
    await screen.findByText(/6 review runs/);
    const add = vi.spyOn(document, "addEventListener");
    fireEvent.click(screen.getByText("bump"));
    expect(screen.getByTestId("n")).toHaveTextContent("1");
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(closed).toHaveBeenCalledWith(1);
    add.mockRestore();
  });

  it("F1 / C-AC-24: confirm sends a body-less POST", async () => {
    const api = mockFetch([estimate({}), post(BULK, () => ({ results: [] }))]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    await confirmWhenReady();
    await screen.findByText(/0 pull requests started/);
    const posts = api.callsTo("POST", BULK);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toBeUndefined();
  });

  it("F1 / C-AC-26: a PR that failed to start is listed by title without presenting the batch as failed", async () => {
    mockFetch([
      estimate({}),
      post(BULK, () => ({
        results: [
          { pr_id: "pr1", outcome: "started", run_ids: ["x"] },
          { pr_id: "pr2", outcome: "failed", run_ids: [], reason: "clone missing" },
          { pr_id: "pr3", outcome: "skipped", run_ids: [], reason: "in flight" },
        ],
      })),
    ]);
    renderApp(<ReviewAllDialog repoId="r1" pulls={PULLS} onClose={() => {}} />);
    await confirmWhenReady();
    expect(await screen.findByText(/1 pull request started, 1 skipped, 1 failed to start/)).toBeInTheDocument();
    expect(screen.getByText("#2 PR 2: clone missing")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
  });
});
