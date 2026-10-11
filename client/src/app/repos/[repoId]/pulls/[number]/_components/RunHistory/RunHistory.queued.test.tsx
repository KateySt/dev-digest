/** RunHistory — queued rows render with their queue position (C-AC-20). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import runsMessages from "../../../../../../../../messages/en/runs.json";
import { RunHistory } from "./RunHistory";

// @/lib/github-urls is absent on this branch (pre-existing), which breaks the real
// findings-tooltip import chain; queued rows never render it.
vi.mock("@/components/findings-tooltip", () => ({
  FindingsTooltip: () => null,
  SeverityCountBadges: () => null,
}));

afterEach(cleanup);

const queuedRun: RunSummary = {
  run_id: "run-1",
  agent_id: "a1",
  agent_name: "Security Reviewer",
  pr_number: 482,
  provider: "openrouter",
  model: "m",
  status: "queued",
  error: null,
  duration_ms: null,
  tokens_in: null,
  tokens_out: null,
  cost_usd: null,
  findings_count: null,
  grounding: null,
  ran_at: "2026-06-11T18:44:34.000Z",
  score: null,
  blockers: null,
};

function renderRuns(queuePositions?: Record<string, number | null>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, runs: runsMessages }}>
      <RunHistory runs={[queuedRun]} onOpenTrace={() => {}} queuePositions={queuePositions} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — queued", () => {
  it("renders a queued run with its queue position, not as approved", () => {
    renderRuns({ "run-1": 2 });
    expect(screen.getByText("Queued · #2 in line")).toBeInTheDocument();
    expect(screen.queryByText("approved")).not.toBeInTheDocument();
  });

  it("falls back to plain 'Queued' when no position is known", () => {
    renderRuns();
    expect(screen.getByText("Queued")).toBeInTheDocument();
  });
});
