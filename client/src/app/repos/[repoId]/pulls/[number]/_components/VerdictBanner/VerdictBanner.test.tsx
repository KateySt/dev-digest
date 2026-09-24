import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

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

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function renderBanner(props: Partial<React.ComponentProps<typeof VerdictBanner>> = {}) {
  return renderWithIntl(
    <VerdictBanner
      verdict="request_changes"
      summary="Hardcoded secret introduced."
      score={42}
      findingsCount={1}
      blockers={1}
      agentName="Security Reviewer"
      {...props}
    />,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderBanner();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("renders the cost/tokens line when runSummary is provided", () => {
    renderBanner({ runSummary: runSummary() });
    expect(screen.getByText(/8\.2K→1\.3K/)).toBeInTheDocument();
  });

  it("does not render a cost line when runSummary is not provided", () => {
    renderBanner();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("shows the findings info tooltip trigger and lists findings on hover", () => {
    renderBanner({ findings: [finding()] });
    const trigger = screen.getByTitle("View findings");
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("passes an empty (never undefined) findings array to the tooltip when findings is omitted, disabling the hover popover", () => {
    // FindingsTooltip treats `findings.length === 0` (a resolved, confirmed
    // empty list) as "no dead hover target" and disables the popover — this
    // only works because VerdictBanner passes `findings ?? []`, never
    // `undefined`, which would instead read as "not yet resolved" and stay
    // hoverable.
    renderBanner();
    const trigger = screen.getByTitle("View findings");
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText("No findings.")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings?$/)).not.toBeInTheDocument();
  });

  it("clicking the refresh button calls onRefresh", () => {
    const onRefresh = vi.fn();
    renderBanner({ onRefresh });
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not render a refresh button when onRefresh is not provided", () => {
    renderBanner();
    expect(screen.queryByRole("button", { name: /refresh/i })).not.toBeInTheDocument();
  });

  it("disables the refresh button when disableRefresh is true", () => {
    renderBanner({ onRefresh: () => {}, disableRefresh: true });
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });

  it("disables the refresh button while refreshing", () => {
    renderBanner({ onRefresh: () => {}, refreshing: true });
    expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled();
  });
});
