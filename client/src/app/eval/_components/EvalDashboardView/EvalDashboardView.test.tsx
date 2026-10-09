import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import type { EvalCrossAgentDashboard } from "@devdigest/shared";
import { get, mockFetch, renderApp, suiteRun } from "@/test/eval-utils";

// The shell reads the active tab from the URL; default (no `tab`) is Agents.
const nav = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
}));
// App chrome (nav, shortcuts, palette) is irrelevant here; render the page body only.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Local-time ISO so the displayed "YYYY-MM-DD HH:mm" is TZ-independent. */
const localIso = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();

const LAST = suiteRun({
  id: "run-a",
  agent_id: "ag1",
  agent_version: 7,
  started_at: localIso(2026, 5, 29, 9, 14),
  recall: 0.85,
  precision: 0.9,
  citation_accuracy: 0.7,
  passed_count: 17,
  evaluated_count: 20,
});

function dashboard(over: Partial<EvalCrossAgentDashboard> = {}): EvalCrossAgentDashboard {
  return {
    agents: [
      {
        agent_id: "ag1",
        agent_name: "Security Reviewer",
        model: "gpt-4.1",
        cases_total: 20,
        latest_run: LAST,
        history: [
          { recall: 0.7, precision: 0.8, citation_accuracy: 0.6 },
          { recall: 0.85, precision: 0.9, citation_accuracy: 0.7 },
        ],
        running_run: null,
      },
      {
        agent_id: "ag2",
        agent_name: "Perf Reviewer",
        model: "gpt-4o",
        cases_total: 3,
        latest_run: null,
        history: [],
        running_run: null,
      },
    ],
    recent_runs: [{ ...LAST, agent_name: "Security Reviewer" }],
    ...over,
  };
}

function setup(payload: () => EvalCrossAgentDashboard = () => dashboard()) {
  const net = mockFetch([get("/eval-dashboard", () => payload())]);
  renderApp(<EvalDashboardView />);
  return net;
}

describe("EvalDashboardView", () => {
  it("C-39: shows the header, an agents list (name, model chip, 'Last run vN · date · x/y pass', sparkline, recall/prec/cite %, link to the per-agent dashboard) and the recent runs table", async () => {
    setup();
    expect(await screen.findByRole("heading", { level: 1, name: "Eval Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Regression harness across all reviewer agents · pick an agent to see its runs")).toBeInTheDocument();

    const card = (await screen.findByRole("link", { name: "Open Security Reviewer eval dashboard" })) as HTMLElement;
    expect(card).toHaveAttribute("href", "/eval/ag1");
    expect(within(card).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(card).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(card).getByText("Last run v7 · 2026-05-29 09:14 · 17/20 pass")).toBeInTheDocument();
    expect(card.querySelector('svg path[stroke-width="1.5"]')).not.toBeNull(); // sparkline
    expect(within(card).getByText("RECALL")).toBeInTheDocument();
    expect(within(card).getByText("PREC")).toBeInTheDocument();
    expect(within(card).getByText("CITE")).toBeInTheDocument();
    expect(within(card).getByText("85")).toBeInTheDocument();
    expect(within(card).getByText("90")).toBeInTheDocument();
    expect(within(card).getByText("70")).toBeInTheDocument();

    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Agent",
      "Ran at",
      "Version",
      "Recall",
      "Precision",
      "Citation",
      "Pass",
    ]);
    const row = within(table).getAllByRole("row")[1]!;
    for (const text of ["Security Reviewer", "2026-05-29 09:14", "v7", "85%", "90%", "70%", "17/20"]) {
      expect(within(row).getByText(text)).toBeInTheDocument();
    }
  });

  it("C-41: an agent that was never run shows 'never run' and '—' metrics", async () => {
    setup();
    const card = (await screen.findByRole("link", { name: "Open Perf Reviewer eval dashboard" })) as HTMLElement;
    expect(within(card).getByText("never run")).toBeInTheDocument();
    expect(within(card).getAllByText("—")).toHaveLength(3);
    expect(card.querySelector('svg path[stroke-width="1.5"]')).toBeNull(); // nothing to plot
  });

  it("C-40: 'Run all agents' replaces the old 'Run eval (N)' button, starts runs for eligible agents and reports started / already-running", async () => {
    const net = setup();
    net.on("POST", "/eval-dashboard/run-all", () => ({ started: ["ag1", "ag2"], skipped: ["ag3"] }));

    expect(screen.queryByRole("button", { name: /Run eval \(/ })).not.toBeInTheDocument();
    const btn = await screen.findByRole("button", { name: "Run all agents" });
    await vi.waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);

    expect(await screen.findByRole("status")).toHaveTextContent("Started 2 agents · 1 already running");
    expect(net.callsTo("POST", "/eval-dashboard/run-all")).toHaveLength(1);
  });

  it("C-40: shows per-agent running state with progress, disables 'Run all agents' meanwhile, and polls every 2s until every run finishes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let running: { id: string; cases_done: number; cases_total: number } | null = { id: "s1", cases_done: 1, cases_total: 20 };
    const net = setup(() => {
      const d = dashboard();
      d.agents[0] = { ...d.agents[0]!, running_run: running };
      return d;
    });

    expect(await screen.findByText("Running 1/20…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeDisabled();

    running = { id: "s1", cases_done: 12, cases_total: 20 };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByText("Running 12/20…")).toBeInTheDocument();

    running = null; // finished
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByText("Last run v7 · 2026-05-29 09:14 · 17/20 pass")).toBeInTheDocument();
    expect(screen.queryByText(/Running \d+\/20/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeEnabled();

    // polling stops once nothing is running
    const settled = net.callsTo("GET", "/eval-dashboard").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(net.callsTo("GET", "/eval-dashboard")).toHaveLength(settled);
  });

  it("C-40: 'Run all agents' is disabled when no agent has eval cases", async () => {
    const d = dashboard();
    d.agents.forEach((a) => (a.cases_total = 0));
    setup(() => d);
    await screen.findByRole("link", { name: "Open Security Reviewer eval dashboard" });
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeDisabled();
  });
});
