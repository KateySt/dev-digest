import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

const traceState: { data: RunTrace | undefined; isLoading: boolean } = { data: TRACE, isLoading: false };
vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => traceState,
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  traceState.data = TRACE;
  traceState.isLoading = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("grounding + not-started states", () => {
  it("shows kept/total and a plain-text dropped list when grounding is present", () => {
    traceState.data = {
      ...TRACE,
      grounding: {
        kept: 1,
        total: 2,
        dropped: [{ title: "<b>Bad</b> cite", file: "src/a.ts", start_line: 3, end_line: 9, reason: "line out of range" }],
      },
    };
    renderWithIntl(<RunTraceDrawer runId="r1" onClose={() => {}} />);
    expect(screen.getAllByText("1 of 2 findings kept").length).toBeGreaterThan(0);
    expect(screen.getByText("1 dropped finding")).toBeInTheDocument();
    expect(screen.getByText("<b>Bad</b> cite")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:3-9")).toBeInTheDocument();
    expect(screen.getByText("Reason: line out of range")).toBeInTheDocument();
    expect(screen.queryByText("2/2 passed")).not.toBeInTheDocument();
  });

  it("says none dropped when the dropped list is empty", () => {
    traceState.data = { ...TRACE, grounding: { kept: 2, total: 2, dropped: [] } };
    renderWithIntl(<RunTraceDrawer runId="r1" onClose={() => {}} />);
    expect(screen.getByText("No findings were dropped.")).toBeInTheDocument();
  });

  it("legacy trace shows only the k/n passed string", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" onClose={() => {}} />);
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.queryByText("No findings were dropped.")).not.toBeInTheDocument();
  });

  it("queued run without a trace shows the not-started note, not an error", () => {
    traceState.data = undefined;
    renderWithIntl(<RunTraceDrawer runId="r1" running queued onClose={() => {}} />);
    fireEvent.click(screen.getByText("trace"));
    expect(screen.getByText(/has not started yet/)).toBeInTheDocument();
    expect(screen.queryByText("No trace available yet.")).not.toBeInTheDocument();
  });

  it("running prop opens on the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" running onClose={() => {}} />);
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});
