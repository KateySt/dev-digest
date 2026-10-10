/* SPEC-08 client flow tests for the Skill Editor's eval surface: header (SK-1),
   "Run on evals" draft/normal runs (SK-2, SK-3), Draft results (SK-4..6) and
   the skill Evals tab (SK-7..18). The real hooks, tab and editor run; `fetch`
   is the only mocked boundary, plus the CodeMirror editor (jsdom cannot drive
   a contenteditable) which is swapped for a plain textarea. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { ToastProvider } from "@/lib/contexts";
import {
  apiError,
  caseRun,
  evalCase,
  get,
  mockFetch,
  post,
  renderApp,
  skill as makeSkill,
  skillEvalRuns,
  skillRun,
  skillRunDetail,
  stats,
} from "@/test/eval-utils";

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string) => void }) => (
    <textarea aria-label="Skill body editor" value={value} onChange={(e) => onChange?.(e.target.value)} />
  ),
}));

import { SkillEditor } from "./SkillEditor";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SAVED_BODY = "# PR quality rubric\nPrefer small, single-purpose PRs.";

const CASES = [
  evalCase({
    id: "c-pass",
    owner_kind: "skill",
    owner_id: "sk1",
    name: "small-pr",
    last_run: caseRun({ case_id: "c-pass", pass: true, actual_output: [{ id: "x" }] }),
  }),
  evalCase({
    id: "c-fail",
    owner_kind: "skill",
    owner_id: "sk1",
    name: "huge-pr",
    last_run: caseRun({ case_id: "c-fail", pass: false, actual_output: [] }),
  }),
  evalCase({ id: "c-empty", owner_kind: "skill", owner_id: "sk1", name: "assert-nothing", kind: "must_not_flag", expected_output: [], last_run: null }),
];

const V1 = skillRun({ id: "sr1", skill_version: 1, recall: 0.5, precision: 0.6, citation_accuracy: 0.7, started_at: "2026-06-01T09:00:00.000Z" });
const V2 = skillRun({ id: "sr2", skill_version: 2, recall: 0.9, precision: 0.8, citation_accuracy: 0.7, started_at: "2026-06-02T09:00:00.000Z", passed_count: 2, evaluated_count: 3 });

interface Setup {
  skill?: Skill;
  cases?: unknown;
  runs?: () => unknown;
  stats?: ReturnType<typeof stats>;
  tab?: string;
}

/** Keeps the tab in state like the Skills Lab does (the caller owns `?tab=`). */
function Host({ tab: initial }: { tab: string }) {
  const [tab, setTab] = React.useState(initial);
  return <SkillEditor skillId="sk1" tab={tab} onTab={setTab} onClosed={() => {}} />;
}

function setup(over: Setup = {}) {
  const skill = over.skill ?? makeSkill();
  const net = mockFetch([
    get("/skills/sk1", () => skill),
    get("/repos", () => []),
    get(/^\/eval-cases\?owner_kind=skill&owner_id=sk1$/, () => over.cases ?? CASES),
    get("/skills/sk1/eval-stats", () =>
      over.stats ?? stats({ latest_run: null, recall: 0.9, precision: 0.8, citation_accuracy: 0.7, delta: { recall: 0.4, precision: 0.2, citation_accuracy: 0 }, traces_passed: 2, traces_evaluated: 3 }),
    ),
    get(/^\/skills\/sk1\/eval-runs/, () => (over.runs ? over.runs() : skillEvalRuns({ history: [V1, V2] }))),
  ]);
  const view = renderApp(
    <ToastProvider>
      <Host tab={over.tab ?? "evals"} />
    </ToastProvider>,
  );
  return { net, ...view };
}

const runOnEvals = () => screen.getByRole("button", { name: "Run on evals" });

describe("Skill Editor header", () => {
  it("SK-1: shows the skill name, its type badge, the version chip and a 'Run on evals' button", async () => {
    setup();
    expect(await screen.findByRole("heading", { level: 2, name: "pr-quality-rubric" })).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(runOnEvals()).toBeInTheDocument();
  });
});

describe("Skill Editor: Run on evals", () => {
  it("SK-2: with unsaved Config text it starts a DRAFT run with that text, switches to Evals and shows 'Draft results' with 'Running X/Y…'", async () => {
    const net = setup({ tab: "config" }).net;
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "d-1", status: "running", cases_total: 3, is_draft: true }));
    net.on("GET", "/eval-suite-runs/d-1", () =>
      skillRunDetail({ id: "d-1", is_draft: true, skill_version: null, status: "running", cases_done: 1, cases_total: 3, recall: null, precision: null, citation_accuracy: null }),
    );

    const editor = await screen.findByLabelText("Skill body editor");
    fireEvent.change(editor, { target: { value: "# Edited but unsaved" } });
    fireEvent.click(runOnEvals());

    const draft = await screen.findByRole("region", { name: "Draft results" });
    expect(within(draft).getByText("draft")).toBeInTheDocument();
    expect(within(draft).getByText("Running 1/3…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Running 1/3…" })).toBeDisabled();
    const posts = net.callsTo("POST", "/skills/sk1/eval-runs");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toEqual({ draft_body: "# Edited but unsaved" });
    // switched to the Evals tab: the Config editor is gone
    expect(screen.queryByLabelText("Skill body editor")).not.toBeInTheDocument();
  });

  it("SK-3: with Config text equal to the saved text it starts a normal versioned run (no draft_body) and shows no Draft results block", async () => {
    const net = setup({ tab: "config" }).net;
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 3, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 3 }));

    await screen.findByLabelText("Skill body editor");
    fireEvent.click(runOnEvals());

    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Running 0/3…" })).toBeDisabled());
    expect(net.callsTo("POST", "/skills/sk1/eval-runs")).toHaveLength(1);
    expect(net.callsTo("POST", "/skills/sk1/eval-runs")[0]!.body).toBeUndefined();
    expect(screen.queryByRole("region", { name: "Draft results" })).not.toBeInTheDocument();
  });

  it("SK-3: editing the text back to the saved text turns 'Run on evals' back into a normal run", async () => {
    const net = setup({ tab: "config" }).net;
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 3, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 3 }));

    const editor = await screen.findByLabelText("Skill body editor");
    fireEvent.change(editor, { target: { value: "changed" } });
    fireEvent.change(editor, { target: { value: SAVED_BODY } });
    fireEvent.click(runOnEvals());

    await vi.waitFor(() => expect(net.callsTo("POST", "/skills/sk1/eval-runs")).toHaveLength(1));
    expect(net.callsTo("POST", "/skills/sk1/eval-runs")[0]!.body).toBeUndefined();
  });

  it("SK-2: unsaved text survives a tab switch (the draft is lifted above the tabs)", async () => {
    setup({ tab: "config" });
    const editor = await screen.findByLabelText("Skill body editor");
    fireEvent.change(editor, { target: { value: "keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Evals" }));
    await screen.findByRole("button", { name: /Run all evals/ });
    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    expect(await screen.findByLabelText("Skill body editor")).toHaveValue("keep me");
  });
});

describe("Skill Evals tab: draft results", () => {
  const DRAFT = skillRunDetail({
    id: "d-2",
    is_draft: true,
    skill_version: null,
    status: "completed",
    recall: 0.33,
    precision: 0.5,
    citation_accuracy: 1,
    results: [
      { ...caseRun({ id: "r-a", case_id: "c-pass", pass: true, actual_output: [{ id: "x" }] }), case_name: "small-pr" },
      { ...caseRun({ id: "r-b", case_id: "c-fail", pass: false, actual_output: [] }), case_name: "huge-pr" },
      { ...caseRun({ id: "r-c", case_id: "c-empty", status: "errored", pass: null, error: "model timeout", actual_output: null }), case_name: "assert-nothing" },
    ],
  });

  it("SK-4: a finished draft shows a 'draft' label, the pooled metrics and each case's pass / fail / errored outcome with its summary", async () => {
    setup({ runs: () => skillEvalRuns({ history: [V1, V2], latest_draft: DRAFT }) });
    const draft = await screen.findByRole("region", { name: "Draft results" });
    expect(within(draft).getByText("draft")).toBeInTheDocument();
    for (const pct of ["33", "50", "100"]) expect(within(draft).getByText(pct)).toBeInTheDocument();

    const items = within(draft).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("small-pr")).toBeInTheDocument();
    expect(within(items[0]!).getAllByText("Pass").length).toBeGreaterThan(0);
    expect(within(items[0]!).getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(within(items[1]!).getAllByText("Fail").length).toBeGreaterThan(0);
    expect(within(items[1]!).getByText("expected 1 finding, got 0")).toBeInTheDocument();
    expect(within(items[2]!).getAllByText("Errored").length).toBeGreaterThan(0);
    expect(within(items[2]!).getByText("errored: model timeout")).toBeInTheDocument();
  });

  it("SK-5: a draft never changes the case-row statuses, 'N / M passing', the metric tiles or the mini trend", async () => {
    setup({ runs: () => skillEvalRuns({ history: [V1, V2], latest_draft: DRAFT }) });
    await screen.findByRole("region", { name: "Draft results" });

    // "N / M passing" counts the real last_run results: 1 pass of 2 with a result
    expect(await screen.findByText("1 / 2 passing")).toBeInTheDocument();
    // tiles come from /skills/:id/eval-stats (the latest REAL run), not the draft's 33 / 50 / 100
    const tiles = screen.getByText("Traces passed").closest("div")!.parentElement!.parentElement!;
    expect(within(tiles).getByText("90")).toBeInTheDocument();
    expect(within(tiles).getByText("80")).toBeInTheDocument();
    expect(within(tiles).getByText("2/3")).toBeInTheDocument();
    expect(within(tiles).queryByText("33")).not.toBeInTheDocument();
    // mini trend reflects the two real runs only
    expect(screen.getByText("Trend · last 2 runs")).toBeInTheDocument();
    // case rows keep their own statuses (small-pr passed, huge-pr failed, assert-nothing never run)
    expect(screen.getByRole("img", { name: "Passed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Never run" })).toBeInTheDocument();
  });

  it("SK-6: the latest draft returned by the server is shown after a reload; no draft means no block", async () => {
    setup({ runs: () => skillEvalRuns({ history: [V1, V2], latest_draft: DRAFT }) });
    expect(await screen.findByRole("region", { name: "Draft results" })).toBeInTheDocument();
    cleanup();

    setup();
    await screen.findByText("1 / 2 passing");
    expect(screen.queryByRole("region", { name: "Draft results" })).not.toBeInTheDocument();
  });

  it("SK-4: a failed draft run shows the failure reason", async () => {
    const failed = skillRunDetail({ id: "d-3", is_draft: true, skill_version: null, status: "failed", failure_reason: "interrupted", recall: null, precision: null, citation_accuracy: null });
    setup({ runs: () => skillEvalRuns({ history: [V1, V2], latest_draft: failed }) });
    const draft = await screen.findByRole("region", { name: "Draft results" });
    expect(within(draft).getByRole("alert")).toHaveTextContent("The draft run failed: interrupted");
  });
});

describe("Skill Evals tab: metrics, trend, links", () => {
  it("SK-7: shows Recall, Precision and Citation accuracy of the latest finished run with signed point deltas, plus 'Traces passed x/y'", async () => {
    setup();
    expect(await screen.findByText("▲ 40pt")).toBeInTheDocument(); // recall
    expect(screen.getByText("▲ 20pt")).toBeInTheDocument(); // precision
    expect(screen.getByText("0pt")).toBeInTheDocument(); // citation flat
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation accuracy")).toBeInTheDocument();
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("SK-7: a null metric or no run shows '—' and no delta", async () => {
    setup({
      stats: stats({ recall: null, precision: null, citation_accuracy: null, traces_passed: null, traces_evaluated: null, latest_run: null, delta: { recall: null, precision: null, citation_accuracy: null } }),
      runs: () => skillEvalRuns({ history: [] }),
    });
    await screen.findByText("Traces passed");
    await vi.waitFor(() => expect(screen.getAllByText("—")).toHaveLength(4));
    expect(screen.queryByText(/pt$/)).not.toBeInTheDocument();
  });

  it("SK-8: the mini trend covers the finished runs without a range filter (asks for range=all) and a single run renders as a dot chart", async () => {
    const net = setup({ runs: () => skillEvalRuns({ history: [V2] }) }).net;
    expect(await screen.findByText("Trend · last 1 run")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Metric trend chart" })).toBeInTheDocument();
    expect(net.callsTo("GET", /\/skills\/sk1\/eval-runs\?range=all/).length).toBeGreaterThan(0);
  });

  it("SK-8: shows only the last 10 of a longer history", async () => {
    const many = Array.from({ length: 12 }, (_, i) => skillRun({ id: `h${i}`, skill_version: i + 1, started_at: new Date(2026, 5, i + 1).toISOString() }));
    setup({ runs: () => skillEvalRuns({ history: many }) });
    expect(await screen.findByText("Trend · last 10 runs")).toBeInTheDocument();
  });

  it("SK-8: with no finished run it says so instead of drawing a chart", async () => {
    setup({ runs: () => skillEvalRuns({ history: [] }) });
    expect(await screen.findByText("No finished runs yet — run the evals to start a trend.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Metric trend chart" })).not.toBeInTheDocument();
  });

  it("SK-9: clicking the mini trend navigates to the skill's per-skill dashboard", async () => {
    setup();
    const trend = await screen.findByRole("link", { name: "Open this skill's full eval dashboard" });
    expect(trend).toHaveAttribute("href", "/eval/skills/sk1");
  });

  it("SK-18: 'View full dashboard →' points at the per-skill dashboard", async () => {
    setup();
    expect(await screen.findByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/eval/skills/sk1");
  });
});

describe("Skill Evals tab: case list", () => {
  it("SK-10: 'N / M passing' counts only cases with a result, with the total in a separate chip", async () => {
    setup();
    expect(await screen.findByText("1 / 2 passing")).toBeInTheDocument();
    expect(screen.getByText("3 cases")).toBeInTheDocument();
  });

  it("SK-11: a row shows the status icon, name, kind badge, summary, the right chip (SEVERITY · category / 'empty []') and Run / Edit / Delete", async () => {
    setup();
    await screen.findByText("small-pr");
    expect(screen.getByText("expected 1 finding, got 1")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();
    expect(screen.getAllByText("Must find")).toHaveLength(2);
    expect(screen.getByText("Must not flag")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL · security").length).toBeGreaterThan(0);
    expect(screen.getAllByText("empty []")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Run" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(3);
  });

  it("SK-12: 'Run all evals' is labelled with the case count and starts a suite run for the skill (no draft body)", async () => {
    const net = setup().net;
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 3, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 3 }));

    fireEvent.click(await screen.findByRole("button", { name: "Run all evals (3)" }));

    expect(await screen.findByRole("button", { name: "Running 0/3…" })).toBeDisabled();
    const posts = net.callsTo("POST", "/skills/sk1/eval-runs");
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toBeUndefined();
    // the removed synchronous endpoint is never used
    expect(net.calls.some((c) => c.path.includes("eval-cases/run-all"))).toBe(false);
  });

  it("SK-13: while a run is running, 'Run all evals', 'Run on evals' and per-row Run are disabled, progress is polled every 2s and updates until the run ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let detail = skillRunDetail({ id: "run-9", status: "running", cases_done: 1, cases_total: 3 });
    const net = setup().net;
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 3, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () => detail);

    fireEvent.click(await screen.findByRole("button", { name: "Run all evals (3)" }));
    expect(await screen.findByRole("button", { name: "Running 1/3…" })).toBeDisabled();
    expect(runOnEvals()).toBeDisabled();
    for (const run of screen.getAllByRole("button", { name: "Run" })) expect(run).toBeDisabled();
    expect(runOnEvals()).toHaveAccessibleDescription("A run is already in progress.");

    detail = skillRunDetail({ id: "run-9", status: "running", cases_done: 2, cases_total: 3 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByRole("button", { name: "Running 2/3…" })).toBeDisabled();

    detail = skillRunDetail({ id: "run-9", status: "completed", cases_done: 3, cases_total: 3 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByRole("button", { name: "Run all evals (3)" })).toBeEnabled();
    expect(runOnEvals()).toBeEnabled();
  });

  it("SK-14: when a suite run finishes the metrics, mini trend and case list refresh without a reload", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let finished = false;
    const net = setup({
      cases: undefined,
    }).net;
    net.on("GET", /^\/eval-cases\?owner_kind=skill&owner_id=sk1$/, () =>
      finished
        ? [{ ...CASES[0]! }, { ...CASES[1]!, last_run: caseRun({ case_id: "c-fail", pass: true, actual_output: [{ id: "y" }] }) }, CASES[2]!]
        : CASES,
    );
    net.on("GET", "/skills/sk1/eval-stats", () =>
      stats({ recall: finished ? 0.99 : 0.9, precision: 0.8, citation_accuracy: 0.7, delta: { recall: 0, precision: 0, citation_accuracy: 0 }, traces_passed: 2, traces_evaluated: 3 }),
    );
    net.on("GET", /^\/skills\/sk1\/eval-runs/, () => skillEvalRuns({ history: finished ? [V1, V2, skillRun({ id: "sr3", skill_version: 2 })] : [V1, V2] }));
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 3, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () =>
      skillRunDetail({ id: "run-9", status: finished ? "completed" : "running", cases_done: finished ? 3 : 1, cases_total: 3 }),
    );

    expect(await screen.findByText("1 / 2 passing")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run all evals (3)" }));
    await screen.findByRole("button", { name: "Running 1/3…" });

    finished = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByText("2 / 2 passing")).toBeInTheDocument();
    expect(await screen.findByText("99")).toBeInTheDocument();
    expect(await screen.findByText("Trend · last 3 runs")).toBeInTheDocument();
  });

  it.each([
    ["pending", "Content scan hasn't finished — evals can't run until it passes."],
    ["error", "Content scan failed — re-scan this skill before running evals."],
  ] as const)("SK-15: a %s scan disables 'Run all evals', 'Run on evals' and per-row Run with the scan reason", async (scan_status, reason) => {
    setup({ skill: makeSkill({ scan_status }) });
    const runAll = await screen.findByRole("button", { name: "Run all evals (3)" });
    expect(runAll).toBeDisabled();
    expect(runAll).toHaveAttribute("title", reason);
    expect(runAll).toHaveAccessibleDescription(reason);
    expect(runOnEvals()).toBeDisabled();
    expect(runOnEvals()).toHaveAttribute("title", reason);
    for (const run of screen.getAllByRole("button", { name: "Run" })) {
      expect(run).toBeDisabled();
      expect(run).toHaveAttribute("title", reason);
    }
  });

  it("SK-15: a flagged scan with a critical finding blocks runs; one with only low findings does not", async () => {
    const finding = (severity: "critical" | "low") => ({ severity, category: "exfiltration" as const, excerpt: "x", location: "l", explanation: "e" });
    setup({ skill: makeSkill({ scan_status: "flagged", scan_findings: [finding("critical")] }) });
    expect(await screen.findByRole("button", { name: "Run all evals (3)" })).toBeDisabled();
    expect(runOnEvals()).toHaveAttribute("title", "Content scan flagged blocking issues — resolve them before running evals.");
    cleanup();

    setup({ skill: makeSkill({ scan_status: "flagged", scan_findings: [finding("low")] }) });
    expect(await screen.findByRole("button", { name: "Run all evals (3)" })).toBeEnabled();
    expect(runOnEvals()).toBeEnabled();
  });

  it("SK-16: when the server refuses a run it shows the server's message and starts no polling", async () => {
    const net = setup().net;
    net.on("POST", "/skills/sk1/eval-runs", () => apiError(409, "A run is already in progress for this skill.", undefined, "conflict"));

    fireEvent.click(await screen.findByRole("button", { name: "Run all evals (3)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A run is already in progress for this skill.");
    expect(screen.getByRole("button", { name: "Run all evals (3)" })).toBeEnabled();
    expect(net.calls.filter((c) => c.path.startsWith("/eval-suite-runs/"))).toHaveLength(0);
  });

  it("SK-17: a skill without cases disables 'Run all evals' and 'Run on evals' and shows the empty state with '+ New eval case'", async () => {
    setup({ cases: [], runs: () => skillEvalRuns({ history: [], cases_total: 0 }) });
    expect(await screen.findByText(/No eval cases yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals (0)" })).toBeDisabled();
    await vi.waitFor(() => expect(runOnEvals()).toBeDisabled());
    expect(runOnEvals()).toHaveAttribute("title", "Add an eval case first.");
    expect(screen.getByRole("button", { name: "New eval case" })).toBeEnabled();
  });

  it("SK-17: '+ New eval case' creates a case owned by the skill and the list refreshes", async () => {
    let cases = [] as typeof CASES;
    const net = setup({ cases: [] }).net;
    net.on("GET", /^\/eval-cases\?owner_kind=skill&owner_id=sk1$/, () => cases);
    net.on("POST", "/eval-cases", (c) => {
      cases = [evalCase({ id: "new-1", owner_kind: "skill", owner_id: "sk1", name: (c.body as { name: string }).name })];
      return cases[0];
    });

    fireEvent.click(await screen.findByRole("button", { name: "New eval case" }));
    fireEvent.change(screen.getByPlaceholderText("stripe-key-leak"), { target: { value: "brand-new-case" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("brand-new-case")).toBeInTheDocument();
    expect(net.callsTo("POST", "/eval-cases")[0]!.body).toMatchObject({ owner_kind: "skill", owner_id: "sk1", name: "brand-new-case" });
  });
});
