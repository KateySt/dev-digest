import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import type { AgentEvalRuns } from "@devdigest/shared";
import { agent, get, mockFetch, renderApp, suiteRun } from "@/test/eval-utils";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ agentId: "ag1" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.search,
}));
// App chrome (nav, shortcuts, palette) is irrelevant here; render the page body only.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgentEvalDashboard } from "./AgentEvalDashboard";

/** Local-time ISO so the table's local "YYYY-MM-DD HH:mm" is TZ-independent. */
const localIso = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();

const R1 = suiteRun({
  id: "r1",
  agent_version: 1,
  started_at: localIso(2026, 5, 20, 9, 14),
  recall: 0.8,
  precision: 0.9,
  citation_accuracy: 0.8,
  passed_count: 4,
  evaluated_count: 5,
  cost_usd: 0.1,
});
const R2 = suiteRun({
  id: "r2",
  agent_version: 2,
  started_at: localIso(2026, 5, 25, 10, 30),
  recall: 0.9,
  precision: 0.7,
  citation_accuracy: 0.8,
  passed_count: 3,
  evaluated_count: 4,
  errored_count: 1,
  cost_usd: 0.25,
});
const R3_RUNNING = suiteRun({ id: "r3", agent_version: 3, status: "running", started_at: localIso(2026, 5, 28, 8, 0), cases_done: 2, cases_total: 5, recall: null, precision: null, citation_accuracy: null, cost_usd: null, passed_count: 0, evaluated_count: 0 });

const ALERT = {
  version: 2,
  previous_version: 1,
  drops: [{ metric: "precision" as const, points: 20 }],
  others: [
    { metric: "recall" as const, direction: "up" as const },
    { metric: "citation_accuracy" as const, direction: "flat" as const },
  ],
  message: "ignored - the UI renders from the structured fields",
};

function runsPayload(over: Partial<AgentEvalRuns> = {}): AgentEvalRuns {
  return { runs: [R2, R1], history: [R1, R2], alert: ALERT, cases_total: 5, ...over };
}

let net: ReturnType<typeof mockFetch>;
function setup(payload: (path: string) => AgentEvalRuns = () => runsPayload(), search = "") {
  nav.search = new URLSearchParams(search);
  net = mockFetch([
    get("/agents/ag1", () => agent({ version: 3 })),
    get("/agents", () => [agent(), agent({ id: "ag2", name: "Perf Reviewer", model: "gpt-4o" })]),
    get("/agents/ag1/eval-runs", (c) => payload(c.path)),
  ]);
  return renderApp(<AgentEvalDashboard />);
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AgentEvalDashboard: header", () => {
  it("C-23: shows the agent name, model chip, 'N runs on the M-case set', agent picker, range selector (default 30 days) and Run eval", async () => {
    setup();
    expect(await screen.findByRole("heading", { level: 1, name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(await screen.findByText("Regression harness · 2 runs on the 5-case set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("30 days");
    expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Switch agent" })).toBeInTheDocument();
    // default range is what the server is asked for
    await vi.waitFor(() => expect(net.callsTo("GET", "/agents/ag1/eval-runs").map((c) => c.path)).toContain("/agents/ag1/eval-runs?range=30d"));
  });

  it("C-23: the agent picker switches to another agent's dashboard", async () => {
    setup();
    await screen.findByRole("heading", { level: 1, name: "Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: "Switch agent" }));
    fireEvent.click(await screen.findByRole("button", { name: /Perf Reviewer/ }));
    expect(nav.push).toHaveBeenCalledWith("/eval/ag2?range=30d");
  });
});

describe("AgentEvalDashboard: range", () => {
  it("C-24: picking a range updates ?range= and the server is asked for that range", async () => {
    setup();
    await screen.findByRole("heading", { level: 1, name: "Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: "Date range" }));
    fireEvent.click(await screen.findByRole("button", { name: "7 days" }));
    expect(nav.replace).toHaveBeenCalledWith("/eval/ag1?range=7d");
  });

  it("C-24: the runs table shows exactly the runs the server returned for the chosen range", async () => {
    setup((path) => (path.includes("range=7d") ? runsPayload({ runs: [R2] }) : runsPayload()), "range=7d");
    await screen.findByText("v2", { selector: "td" });
    expect(screen.queryByText("v1", { selector: "td" })).not.toBeInTheDocument();
  });

  it("C-24: the trend chart is filtered to the range too (one completed run in range -> single-point chart, not the all-time history)", async () => {
    // history has 3 completed runs all-time; only R2 is inside the 7d range.
    const R0 = suiteRun({ id: "r0", agent_version: 0, started_at: localIso(2026, 1, 1, 9, 0) });
    setup((path) => (path.includes("range=7d") ? runsPayload({ runs: [R2], history: [R0, R1, R2] }) : runsPayload()), "range=7d");
    await screen.findByText("v2", { selector: "td" });
    // A single in-range point renders as the dot chart (role=img); an all-time (3-point) chart would not.
    expect(await screen.findByRole("img", { name: "Metric trend chart" })).toBeInTheDocument();
  });

  it("C-25: metric cards and the regression banner keep using the latest finished run vs the previous one, even when no run is in range", async () => {
    setup((path) => (path.includes("range=7d") ? runsPayload({ runs: [] }) : runsPayload()), "range=7d");
    // latest finished run is R2: recall 90, precision 70, citation 80; deltas vs R1.
    expect(await screen.findByText("90")).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText("▲ 10pt")).toBeInTheDocument(); // recall .8 -> .9
    expect(screen.getByText("▼ 20pt")).toBeInTheDocument(); // precision .9 -> .7
    expect(screen.getByRole("status")).toHaveTextContent("Precision dipped 20pts");
    expect(screen.getByText("No runs in this range.")).toBeInTheDocument();
  });
});

describe("AgentEvalDashboard: banner and cards", () => {
  it("C-26: renders a warning banner from the server's structured alert (above the cards); none when the alert is null", async () => {
    setup();
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Precision dipped 20pts on v2 (vs v1). Recall up, Citation accuracy unchanged.");
    // Rendered from structured fields, not the server's English message.
    expect(banner).not.toHaveTextContent("ignored");
    cleanup();

    setup(() => runsPayload({ alert: null }));
    await screen.findByText("RECALL");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("C-27: three metric cards show the latest value, a signed delta vs the previous run, and a sparkline", async () => {
    setup();
    for (const label of ["RECALL", "PRECISION", "CITATION ACCURACY"]) {
      const card = (await screen.findByText(label)).parentElement!.parentElement!;
      expect(card.querySelector('svg path[stroke-width="1.5"]')).not.toBeNull(); // sparkline
    }
    const recallCard = screen.getByText("RECALL").parentElement!.parentElement!;
    expect(within(recallCard).getByText("90")).toBeInTheDocument();
    expect(within(recallCard).getByText("▲ 10pt")).toBeInTheDocument();
    const precisionCard = screen.getByText("PRECISION").parentElement!.parentElement!;
    expect(within(precisionCard).getByText("▼ 20pt")).toBeInTheDocument();
    const citationCard = screen.getByText("CITATION ACCURACY").parentElement!.parentElement!;
    expect(within(citationCard).getByText("0pt")).toBeInTheDocument();
  });
});

describe("AgentEvalDashboard: trend + runs table", () => {
  it("C-28: shows the three-series legend and a runs table with checkbox, ran at, version, three metric bars, pass x/y, cost and status", async () => {
    setup(() => runsPayload({ runs: [R3_RUNNING, R2, R1], history: [R1, R2] }));
    await screen.findByText("Metric trend");
    for (const name of ["Recall", "Precision", "Citation"]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Select",
      "Ran at",
      "Version",
      "Recall",
      "Precision",
      "Citation",
      "Pass",
      "Cost",
      "Status",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    const r2 = rows[1]!;
    expect(within(r2).getByRole("checkbox")).toBeInTheDocument();
    expect(within(r2).getByText("2026-05-25 10:30")).toBeInTheDocument();
    expect(within(r2).getByText("v2")).toBeInTheDocument();
    for (const pct of ["90%", "70%", "80%"]) expect(within(r2).getByText(pct)).toBeInTheDocument();
    expect(within(r2).getByText("3/4")).toBeInTheDocument();
    expect(within(r2).getByText("1 errored")).toBeInTheDocument();
    expect(within(r2).getByText("$0.25")).toBeInTheDocument();
    expect(within(r2).getByText("Completed")).toBeInTheDocument();

    // running run: progress instead of pass x/y, status chip, "—" for null metrics/cost.
    const running = rows[0]!;
    expect(within(running).getByText("2/5")).toBeInTheDocument();
    expect(within(running).getByText("Running")).toBeInTheDocument();
    expect(within(running).getAllByText("—").length).toBeGreaterThanOrEqual(4);
  });

  it("C-29: Compare is enabled only with exactly two runs selected, and '2 selected' is shown", async () => {
    const R0 = suiteRun({ id: "r0", agent_version: 0, started_at: localIso(2026, 5, 1, 9, 0) });
    setup(() => runsPayload({ runs: [R2, R1, R0], history: [R0, R1, R2] }));
    await screen.findByRole("table");
    const compare = screen.getByRole("button", { name: "Compare" });
    const boxes = () => screen.getAllByRole("checkbox");

    expect(compare).toBeDisabled();
    expect(compare).toHaveAccessibleDescription("Select exactly two runs to compare");

    fireEvent.click(boxes()[0]!);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();

    fireEvent.click(boxes()[1]!);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();

    fireEvent.click(boxes()[2]!);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();
  });

  it("C-29: the checkboxes are keyboard-operable named controls", async () => {
    setup();
    await screen.findByRole("table");
    const box = screen.getByRole("checkbox", { name: /Select run v2 from 2026-05-25 10:30/ });
    expect(box.tagName).toBe("BUTTON"); // focusable + activatable with Enter/Space natively
    expect(box).toHaveAttribute("aria-checked", "false");
    fireEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
  });
});

describe("AgentEvalDashboard: empty + running", () => {
  const NEVER = { runs: [], history: [], alert: null, cases_total: 3 };

  it("C-30: with no suite runs shows an empty state prompting 'Run eval'", async () => {
    setup(() => NEVER);
    expect(await screen.findByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // header button + the empty-state call to action
    expect(screen.getAllByRole("button", { name: "Run eval" })).toHaveLength(2);
  });

  it("clicking Run eval starts a suite run and polls it ('Running X/Y…') every 2s until it finishes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    setup(() => NEVER);
    let done = 0;
    let state: "running" | "completed" = "running";
    net.on("POST", "/agents/ag1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 3 }));
    net.on("GET", "/eval-suite-runs/run-9", () => ({ ...suiteRun({ id: "run-9", status: state, cases_done: done, cases_total: 3 }), results: [] }));

    fireEvent.click((await screen.findAllByRole("button", { name: "Run eval" }))[0]!);
    expect(await screen.findByRole("button", { name: "Running 0/3…" })).toBeDisabled();

    done = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByRole("button", { name: "Running 2/3…" })).toBeDisabled();

    state = "completed";
    done = 3;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const buttons = await screen.findAllByRole("button", { name: "Run eval" }); // header + empty-state CTA
    buttons.forEach((b) => expect(b).toBeEnabled());
    // finishing refreshes the agent's run history
    expect(net.callsTo("GET", "/agents/ag1/eval-runs").length).toBeGreaterThan(1);
  });
});
