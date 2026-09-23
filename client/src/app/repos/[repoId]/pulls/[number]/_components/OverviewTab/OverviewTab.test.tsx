/**
 * OverviewTab: the PR brief (latest review's verdict/score/findings), the
 * Intent panel, and the not-yet-implemented Blast radius / Risks / PR history
 * placeholders. Covers the "no review yet" empty state and picking the
 * newest review (reviews arrive newest-first) for the brief + blocker count.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const useIntentMock = vi.fn();
const useRisksMock = vi.fn();

vi.mock("@/lib/hooks/reviews", () => ({
  useIntent: () => useIntentMock(),
  useRisks: () => useRisksMock(),
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

beforeEach(() => {
  useIntentMock.mockReturnValue({ data: undefined, isLoading: false });
  useRisksMock.mockReturnValue({ data: undefined, isLoading: false });
});

afterEach(cleanup);

function renderTab(props: Partial<React.ComponentProps<typeof OverviewTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, prReview: prReviewMessages }}>
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
});

describe("OverviewTab — placeholders", () => {
  it("renders the not-yet-implemented Blast radius, Risks and PR history sections", () => {
    renderTab({ reviews: [review()] });

    // The section label and the EmptyState title both read "Blast radius".
    expect(screen.getAllByText("Blast radius").length).toBeGreaterThan(0);
    expect(screen.getByText("Risks")).toBeInTheDocument();
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.getByText("PR history")).toBeInTheDocument();
    expect(screen.getByText("No prior PRs overlap these files.")).toBeInTheDocument();
  });
});
