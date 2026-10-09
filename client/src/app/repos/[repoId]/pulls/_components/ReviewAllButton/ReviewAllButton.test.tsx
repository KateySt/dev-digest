import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import type { PrMeta } from "@/lib/types";
import { get, mockFetch, post, renderApp } from "@/test/eval-utils";
import { ReviewAllButton } from "./ReviewAllButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pr(n: number, status: string): PrMeta {
  return {
    id: `pr${n}`, number: n, title: `PR ${n}`, author: "a", avatar_url: null, branch: "b", base: "main",
    head_sha: "sha", additions: 1, deletions: 1, files_count: 1, status, opened_at: null, updated_at: null,
    score: null, cost_usd: null, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  } as unknown as PrMeta;
}

describe("ReviewAllButton", () => {
  it("F1 / C-AC-16: the label states the number of PRs needing review (counted from the unfiltered list)", () => {
    renderApp(<ReviewAllButton repoId="r1" pulls={[pr(1, "needs_review"), pr(2, "needs_review"), pr(3, "reviewed")]} />);
    expect(screen.getByRole("button", { name: "Review all (2)" })).toBeEnabled();
  });

  it("F1 / C-AC-23: with no needs_review PR it is disabled, says why, and opens no dialog", async () => {
    renderApp(<ReviewAllButton repoId="r1" pulls={[pr(1, "reviewed")]} />);
    const btn = screen.getByRole("button", { name: /Review all/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("No pull requests need review");
    fireEvent.click(btn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("F1 / C-AC-30: the label comes from the next-intl message, not a literal", () => {
    renderApp(<ReviewAllButton repoId="r1" pulls={[pr(1, "needs_review")]} />);
    expect(screen.queryByText("Review all")).not.toBeInTheDocument();
    expect(screen.getByText("Review all (1)")).toBeInTheDocument();
  });

  it("F1 / NFR a11y: closing the dialog returns focus to the Review all button", async () => {
    mockFetch([
      get("/repos/r1/pulls/review-estimate", () => ({
        pr_count: 1, agent_count: 1, run_count: 1, approx_cost_usd: 0.1, approximate: true, skip_count: 0,
      })),
    ]);
    renderApp(<ReviewAllButton repoId="r1" pulls={[pr(1, "needs_review")]} />);
    const trigger = screen.getByRole("button", { name: "Review all (1)" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    expect(trigger).not.toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("F1 / C-AC-17, C-AC-24: activating opens the dialog with counts, and nothing is posted until confirm", async () => {
    const api = mockFetch([
      get("/repos/r1/pulls/review-estimate", () => ({
        pr_count: 2, agent_count: 2, run_count: 4, approx_cost_usd: 0.4, approximate: true, skip_count: 0,
      })),
      post("/repos/r1/pulls/review", () => ({ results: [] })),
    ]);
    renderApp(<ReviewAllButton repoId="r1" pulls={[pr(1, "needs_review"), pr(2, "needs_review")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Review all (2)" }));
    expect(await screen.findByText(/2 pull requests × 2 enabled agents = 4 review runs/)).toBeInTheDocument();
    expect(api.callsTo("POST", "/repos/r1/pulls/review")).toHaveLength(0);
  });
});
