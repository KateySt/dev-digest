/**
 * OverviewTab: the PR brief (latest review's verdict/score/findings), the
 * Intent panel, and the not-yet-implemented Blast radius / Risks / PR history
 * placeholders. Covers the "no review yet" empty state and picking the
 * newest review (reviews arrive newest-first) for the brief + blocker count.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import commitsMessages from "../../../../../../../../messages/en/commits.json";

const useIntentMock = vi.fn();
const useRisksMock = vi.fn();
const useBlastMock = vi.fn();
const usePrCommitsMock = vi.fn();
const useRefreshPrBriefMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  useIntent: () => useIntentMock(),
  useRisks: () => useRisksMock(),
  useBlast: () => useBlastMock(),
  usePrCommits: () => usePrCommitsMock(),
  useRefreshPrBrief: () => useRefreshPrBriefMock(),
}));

import { OverviewTab } from "./OverviewTab";

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/core.ts",
    start_line: 3,
    end_line: 3,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rev1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Security Reviewer",
    kind: "review",
    verdict: "request_changes",
    summary: "Solid approach, but a secret is committed in plaintext.",
    score: 61,
    model: "gpt-4.1",
    grounding: null,
    created_at: "2026-01-01T00:00:00.000Z",
    findings: [finding()],
    ...overrides,
  };
}

function runSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    pr_number: 42,
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    duration_ms: 1200,
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.014,
    findings_count: 1,
    grounding: null,
    ran_at: "2026-01-01T00:00:00.000Z",
    score: 61,
    blockers: 1,
    ...overrides,
  };
}

beforeEach(() => {
  useIntentMock.mockReturnValue({ data: undefined, isLoading: false });
  useRisksMock.mockReturnValue({ data: undefined, isLoading: false });
  useBlastMock.mockReturnValue({ data: undefined, isLoading: false });
  usePrCommitsMock.mockReturnValue({ data: undefined, isLoading: false });
  refreshMock.mockReset();
  useRefreshPrBriefMock.mockReturnValue({ refresh: refreshMock, isPending: false });
});

afterEach(cleanup);

function renderTab(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: briefMessages, prReview: prReviewMessages, blast: blastMessages, commits: commitsMessages }}
    >
      <OverviewTab prBody={null} prId="pr1" reviews={[]} onNavigateToFile={() => {}} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab — PR brief", () => {
  it("shows the empty state when no review has run yet", () => {
    renderTab({ reviews: [] });
    // The Intent panel (no intent stubbed either) shares the same empty copy.
    expect(screen.getAllByText("Brief not available yet.").length).toBeGreaterThan(0);
  });

  it("shows the newest review's verdict, score, findings and blocker count", () => {
    const older = review({ id: "rev0", score: 90, verdict: "approve", findings: [] });
    const newest = review({ id: "rev1", score: 61 });
    // Newest-first, matching how usePrReviews/page.tsx orders `runs`.
    renderTab({ reviews: [newest, older] });

    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("61")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("excludes dismissed findings from the blocker count", () => {
    const dismissed = finding({ id: "f2", dismissed_at: "2026-01-02T00:00:00.000Z" });
    renderTab({ reviews: [review({ findings: [finding(), dismissed] })] });

    expect(screen.getByText(/2 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("matches the latest review's run summary by run_id when prRuns is supplied", () => {
    const other = runSummary({ run_id: "run-other", tokens_in: 1, tokens_out: 1 });
    const matching = runSummary({ run_id: "run1", tokens_in: 8200, tokens_out: 1300 });
    renderTab({ reviews: [review({ run_id: "run1" })], prRuns: [other, matching] });

    expect(screen.getByText(/8\.2K→1\.3K/)).toBeInTheDocument();
  });

  it("does not show a cost line when no prRuns entry matches the latest review's run_id", () => {
    renderTab({ reviews: [review({ run_id: "run1" })], prRuns: [runSummary({ run_id: "run-other" })] });

    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });
});

describe("OverviewTab — refresh PR brief", () => {
  it("clicking the refresh button calls the useRefreshPrBrief mutation", () => {
    renderTab({ reviews: [review()] });

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("disables the refresh button while a review is running", () => {
    renderTab({ reviews: [review()], reviewRunning: true });
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("disables the refresh button while the refresh mutation is pending", () => {
    useRefreshPrBriefMock.mockReturnValue({ refresh: refreshMock, isPending: true });
    renderTab({ reviews: [review()] });
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });
});

describe("OverviewTab — placeholders", () => {
  it("renders the Blast radius section label, the Risk Areas and Commits sections", () => {
    renderTab({ reviews: [review()] });

    // BlastRadiusPanel/CommitHistoryPanel are unit-tested separately; here
    // just confirm each section is wired in (label + its own "not available
    // yet" state, since useBlast/usePrCommits are mocked to `data: undefined`
    // like the other brief hooks).
    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(screen.getAllByText("Brief not available yet.").length).toBeGreaterThan(0);
    expect(screen.getByText("Risk Areas")).toBeInTheDocument();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("Commits")).toBeInTheDocument();
  });

  it("merges Intent and Risk Areas into one card sharing a common container", () => {
    renderTab({ reviews: [review()] });

    const intentHeading = screen.getByText("Intent");
    const risksHeading = screen.getByText("Risk Areas");
    // Don't assert exact DOM nesting (brittle) — just that both headers sit
    // inside the same ancestor container, i.e. one merged Card rather than
    // two independent sibling sections.
    expect(intentHeading.closest("div")?.parentElement).toBe(
      risksHeading.closest("div")?.parentElement,
    );
  });

  it("does not render the merged Intent/Risk Areas card as an empty shell while intent is still loading", () => {
    useIntentMock.mockReturnValue({ data: undefined, isLoading: true });
    renderTab({ reviews: [review()] });

    // Both section headers still render even though IntentPanel itself
    // renders null while loading (see client/INSIGHTS.md) — the card shell
    // never looks broken/empty, and Risk Areas' own state renders normally.
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("Risk Areas")).toBeInTheDocument();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
  });
});

describe("OverviewTab — Review Focus", () => {
  it("renders the Review Focus card above the two-column grid when a review exists", () => {
    renderTab({ reviews: [review()] });

    expect(screen.getByText("Review Focus — Read These First")).toBeInTheDocument();
    // finding() defaults to file "src/core.ts", start_line 3.
    expect(screen.getByText("src/core.ts:3")).toBeInTheDocument();
  });

  it("shows the not-yet-reviewed empty state (not a confirmed-empty state) when no review has run", () => {
    renderTab({ reviews: [] });

    expect(screen.getByText("Review Focus — Read These First")).toBeInTheDocument();
    expect(screen.getAllByText("Brief not available yet.").length).toBeGreaterThan(0);
  });

  it("excludes dismissed findings from the Review Focus shortlist", () => {
    const dismissed = finding({ id: "f2", title: "Dismissed issue", dismissed_at: "2026-01-02T00:00:00.000Z" });
    renderTab({ reviews: [review({ findings: [dismissed] })] });

    expect(screen.getByText("Review Focus — Read These First")).toBeInTheDocument();
    expect(screen.queryByText("Dismissed issue")).not.toBeInTheDocument();
    expect(screen.getByText("No findings need review.")).toBeInTheDocument();
  });
});
