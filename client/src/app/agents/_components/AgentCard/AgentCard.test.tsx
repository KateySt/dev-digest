import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentPerfRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
  attached_doc_paths: [],
};

const PERF: AgentPerfRow = {
  agent_id: "ag1",
  agent_name: "Security Reviewer",
  provider: "openai",
  model: "gpt-4.1",
  runs: 142,
  findings_total: 60,
  accepted: 46,
  dismissed: 13,
  accept_rate: 46 / 59,
  dismiss_rate: 13 / 59,
  avg_findings_per_run: 0.42,
  total_cost_usd: 5.68,
  avg_cost_usd: 0.04,
  avg_latency_ms: 6200,
  last_run_at: "2026-06-01T09:14:00.000Z",
  findings_by_severity: { CRITICAL: 5, WARNING: 20, SUGGESTION: 35 },
  trend: [1, 2, 0, 3, 1],
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("renders the perf line (runs, accept rate, avg cost) when perf data is present", () => {
    renderWithIntl(<AgentCard ag={AGENT} perf={PERF} />);
    expect(screen.getByText("142 runs · 78% accept · $0.04 avg")).toBeInTheDocument();
  });

  it("renders no perf line when the agent has zero runs", () => {
    renderWithIntl(<AgentCard ag={AGENT} perf={{ ...PERF, runs: 0 }} />);
    expect(screen.queryByText(/runs/)).not.toBeInTheDocument();
  });
});
