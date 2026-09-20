import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const STATS: AgentStats = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  runs: 142,
  findings_total: 60,
  accepted: 46,
  dismissed: 13,
  pending: 1,
  accept_rate: 46 / 59,
  dismiss_rate: 13 / 59,
  avg_findings_per_run: 0.42,
  total_cost_usd: 5.68,
  avg_cost_usd: 0.04,
  avg_latency_ms: 6200,
  findings_by_severity: { CRITICAL: 5, WARNING: 20, SUGGESTION: 35 },
  trend: [
    { label: "2026-05-30", value: 1 },
    { label: "2026-05-31", value: 2 },
  ],
};

const RUNS: RunSummary[] = [
  {
    run_id: "run-1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    pr_number: 482,
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    duration_ms: 6200,
    tokens_in: 15000,
    tokens_out: 1200,
    cost_usd: 0.04,
    findings_count: 3,
    grounding: "3/3 passed",
    ran_at: "2026-06-01T09:14:00.000Z",
    score: 78,
    blockers: 0,
  },
];

vi.mock("../../../../../../../lib/hooks/agent-performance", () => ({
  useAgentStats: () => ({ data: STATS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentRuns: () => ({ data: RUNS }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <StatsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders the metric tiles from AgentStats", () => {
    renderWithIntl();
    expect(screen.getByText("Total runs")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("78")).toBeInTheDocument(); // accept rate, rounded
    expect(screen.getAllByText("$0.04").length).toBeGreaterThan(0);
  });

  it("renders a findings-by-severity bar per severity", () => {
    renderWithIntl();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
  });

  it("renders the run-history table with the PR number and View trace action", () => {
    renderWithIntl();
    expect(screen.getByText("#482")).toBeInTheDocument();
    expect(screen.getByText("View trace")).toBeInTheDocument();
  });
});
