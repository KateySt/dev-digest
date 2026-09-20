/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { githubBlobUrl } from "@/lib/github-urls";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    pr_number: 482,
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0013,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(
  runs: RunSummary[],
  extra?: {
    findingsByRunId?: Map<string, FindingRecord[]>;
    repoFullName?: string | null;
    headSha?: string | null;
  },
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} {...extra} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — cost badge", () => {
  it("a settled run shows its token count and cost", () => {
    renderRuns([run({ status: "done", tokens_in: 9000, tokens_out: 119, cost_usd: 0.0013 })]);
    expect(screen.getByText(/9,119 tok/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.0013/)).toBeInTheDocument();
  });

  it("a running run shows no cost badge yet", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — findings tooltip", () => {
  const FINDING: FindingRecord = {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "because",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };

  it("shows a severity badge cluster (matching the PR list) and opens a tooltip with a working GitHub link on hover", () => {
    renderRuns(
      [run({ run_id: "run-1", status: "done", findings_count: 1, blockers: 0, score: 61 })],
      {
        findingsByRunId: new Map([["run-1", [FINDING]]]),
        repoFullName: "acme/payments-api",
        headSha: "a1b2c3d4e5f6",
      },
    );

    const badgeCount = screen.getByText("1");
    fireEvent.mouseEnter(badgeCount);

    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    const link = screen.getByText(/src\/config\.ts/).closest("a");
    expect(link).toHaveAttribute(
      "href",
      githubBlobUrl("acme/payments-api", "a1b2c3d4e5f6", "src/config.ts", 12, 12),
    );
  });

  it("renders no findings line at all for a clean run with zero findings", () => {
    const { container } = renderRuns(
      [run({ run_id: "run-2", status: "done", findings_count: 0, blockers: 0, score: 95 })],
      { findingsByRunId: new Map([["run-2", []]]) },
    );

    expect(container.querySelector("[aria-haspopup]")).not.toBeInTheDocument();
  });

  it("still shows the blockers count even when per-run finding details aren't loaded", () => {
    // findingsByRunId omitted entirely — must degrade gracefully instead of
    // hiding the blockers text (which doesn't depend on the lazy detail).
    renderRuns([run({ run_id: "run-3", status: "done", findings_count: 2, blockers: 2, score: 20 })]);
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });
});
