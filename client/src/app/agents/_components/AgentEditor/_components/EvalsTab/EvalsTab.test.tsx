import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import type { EvalCaseListItem } from "@devdigest/shared";
import { EvalsTab } from "./EvalsTab";
import { agent, caseRun, evalCase, get, mockFetch, post, renderApp, stats, suiteRun } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const EMPTY_RUNS = { runs: [], history: [], alert: null, cases_total: 0 };

/** Four cases: passing must-find (seeded), failing must-not-flag at a location,
 *  never-run assert-empty, and an errored one. */
const CASES: EvalCaseListItem[] = [
  evalCase({
    id: "c-pass",
    name: "stripe-key-leak",
    source: "finding_accepted",
    last_run: caseRun({ case_id: "c-pass", pass: true, actual_output: [{ id: "x" }] }),
  }),
  evalCase({
    id: "c-fail",
    name: "no-flag-on-config",
    kind: "must_not_flag",
    source: "finding_dismissed",
    expected_output: [{ file: "src/a.ts", start_line: 10, end_line: 12 }],
    last_run: caseRun({ case_id: "c-fail", pass: false, actual_output: [{ id: "x" }, { id: "y" }] }),
  }),
  evalCase({ id: "c-empty", name: "assert-nothing", kind: "must_not_flag", expected_output: [], last_run: null }),
  evalCase({
    id: "c-err",
    name: "flaky-case",
    last_run: caseRun({ case_id: "c-err", status: "errored", pass: null, error: "model timeout", actual_output: null }),
  }),
];

function setup(over: { cases?: EvalCaseListItem[]; stats?: ReturnType<typeof stats>; runs?: unknown } = {}) {
  const cases = over.cases ?? CASES;
  const net = mockFetch([
    get("/agents/ag1/eval-stats", () => over.stats ?? stats()),
    get(/^\/eval-cases\?owner_kind=agent&owner_id=ag1$/, () => cases),
    get("/agents/ag1/eval-runs", () => over.runs ?? { ...EMPTY_RUNS, cases_total: cases.length }),
    get("/agents/ag1", () => agent()),
  ]);
  const view = renderApp(<EvalsTab agentId="ag1" />);
  return { net, ...view };
}

describe("EvalsTab: metric tiles", () => {
  it("C-10: shows Recall, Precision, Citation accuracy with signed point deltas, and Traces passed x/y", async () => {
    setup();
    expect(await screen.findByText("82")).toBeInTheDocument(); // recall 0.82
    expect(screen.getByText("90")).toBeInTheDocument(); // precision
    expect(screen.getByText("75")).toBeInTheDocument(); // citation
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation accuracy")).toBeInTheDocument();
    expect(screen.getByText("▲ 4pt")).toBeInTheDocument(); // recall +0.04
    expect(screen.getByText("▼ 2pt")).toBeInTheDocument(); // precision -0.02
    expect(screen.getByText("0pt")).toBeInTheDocument(); // citation flat
    expect(screen.getByText("17/20")).toBeInTheDocument();
    expect(screen.getByText("Traces passed")).toBeInTheDocument();
  });

  it("C-11: a null metric (or no suite run at all) shows an em dash and no delta", async () => {
    setup({
      stats: stats({
        recall: null,
        precision: null,
        citation_accuracy: null,
        traces_passed: null,
        traces_evaluated: null,
        latest_run: null,
        delta: { recall: null, precision: null, citation_accuracy: null },
      }),
    });
    await screen.findByText("Traces passed");
    await vi.waitFor(() => expect(screen.getAllByText("—")).toHaveLength(4));
    expect(screen.queryByText(/pt$/)).not.toBeInTheDocument();
  });

  it("C-15: shows the mechanical-scoring note", async () => {
    setup();
    expect(
      await screen.findByText("Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer."),
    ).toBeInTheDocument();
  });

  it("C-19: 'View full dashboard →' points at this agent's per-agent dashboard", async () => {
    setup();
    expect(await screen.findByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/ag1");
  });
});

describe("EvalsTab: case list", () => {
  it("C-12: 'N / M passing' counts only cases with a (non-errored) result, plus a separate total chip", async () => {
    setup();
    expect(await screen.findByText("1 / 2 passing")).toBeInTheDocument(); // pass + fail; never-run and errored excluded
    expect(screen.getByText("4 cases")).toBeInTheDocument();
  });

  it("C-13: each row shows status, name, kind badge (seed tooltip only for finding-seeded cases) and summary", async () => {
    setup();
    await screen.findByText("stripe-key-leak");

    // status icons (pass / fail / never run / errored)
    expect(screen.getByRole("img", { name: "Passed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Never run" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Errored" })).toBeInTheDocument();

    // kind badges + seed tooltips
    const mustFind = screen.getAllByText("Must find");
    expect(mustFind[0]).toHaveAttribute("title", "Seeded from an accepted finding");
    expect(mustFind[1]).not.toHaveAttribute("title"); // manual case: no seed tooltip
    const notFlag = screen.getAllByText("Must not flag");
    expect(notFlag[0]).toHaveAttribute("title", "Seeded from a dismissed finding");

    // summaries
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings at src/a.ts:L10–L12, got 2")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getByText("errored: model timeout")).toBeInTheDocument();
  });

  it("C-14: a must-not-flag case with no forbidden locations shows the 'empty []' chip", async () => {
    setup();
    await screen.findByText("assert-nothing");
    expect(screen.getAllByText("empty []")).toHaveLength(1);
  });
});

describe("EvalsTab: Run all evals", () => {
  const started = { run_id: "run-9", status: "running", cases_total: 4 };

  it("C-16: the button is labelled with the case count and starts a suite run for the agent when clicked", async () => {
    const net = setup().net;
    net.on("POST", "/agents/ag1/eval-runs", () => started);
    net.on("GET", "/eval-suite-runs/run-9", () => ({ ...suiteRun({ id: "run-9", status: "running", cases_done: 0, cases_total: 4 }), results: [] }));

    const btn = await screen.findByRole("button", { name: "Run all evals (4)" });
    fireEvent.click(btn);

    expect(await screen.findByRole("button", { name: "Running 0/4…" })).toBeDisabled();
    expect(net.callsTo("POST", "/agents/ag1/eval-runs")).toHaveLength(1);
  });

  it("C-17/C-18: while running the button is disabled and shows 'Running X/Y…' via polling; on completion metrics and cases refresh", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const net = setup().net;
    let progress = 0;
    let finished = false;
    net.on("POST", "/agents/ag1/eval-runs", () => started);
    net.on("GET", "/eval-suite-runs/run-9", () => ({
      ...suiteRun({
        id: "run-9",
        status: finished ? "completed" : "running",
        cases_done: finished ? 4 : progress,
        cases_total: 4,
      }),
      results: [],
    }));

    fireEvent.click(await screen.findByRole("button", { name: "Run all evals (4)" }));

    // First poll result: 0/4, button disabled.
    const running = await screen.findByRole("button", { name: "Running 0/4…" });
    expect(running).toBeDisabled();

    // Poll again (2s) -> progress moves on.
    progress = 2;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByRole("button", { name: "Running 2/4…" })).toBeDisabled();

    // Run finishes: polling stops, the tab refetches stats + cases (no reload).
    const statsCalls = net.callsTo("GET", "/agents/ag1/eval-stats").length;
    const caseCalls = net.callsTo("GET", /^\/eval-cases\?owner_kind=agent/).length;
    finished = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByRole("button", { name: "Run all evals (4)" })).toBeEnabled();
    await vi.waitFor(() => {
      expect(net.callsTo("GET", "/agents/ag1/eval-stats").length).toBeGreaterThan(statsCalls);
      expect(net.callsTo("GET", /^\/eval-cases\?owner_kind=agent/).length).toBeGreaterThan(caseCalls);
    });

    // No further polling once finished.
    const pollsAfter = net.callsTo("GET", "/eval-suite-runs/run-9").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(net.callsTo("GET", "/eval-suite-runs/run-9")).toHaveLength(pollsAfter);
  });

  it("C-17: after a page reload an already-running suite run (reported by the server) is picked up and shown as running", async () => {
    const net = mockFetch([
      get("/agents/ag1/eval-stats", () => stats()),
      get(/^\/eval-cases\?owner_kind=agent/, () => CASES),
      get("/agents/ag1/eval-runs", () => ({
        runs: [suiteRun({ id: "run-7", status: "running", cases_done: 1, cases_total: 4 })],
        history: [],
        alert: null,
        cases_total: 4,
      })),
      get("/eval-suite-runs/run-7", () => ({ ...suiteRun({ id: "run-7", status: "running", cases_done: 1, cases_total: 4 }), results: [] })),
      get("/agents/ag1", () => agent()),
    ]);
    renderApp(<EvalsTab agentId="ag1" />);

    const btn = await screen.findByRole("button", { name: "Running 1/4…" });
    expect(btn).toBeDisabled();
    expect(net.callsTo("POST", "/agents/ag1/eval-runs")).toHaveLength(0);
  });
});

describe("EvalsTab: case editor entry", () => {
  it("opens the new-case modal from '+ New eval case'", async () => {
    setup({ cases: [] });
    fireEvent.click(await screen.findByRole("button", { name: "New eval case" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("New eval case")).toBeInTheDocument();
  });
});
