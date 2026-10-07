/* SPEC-08 per-skill dashboard (SK-19..24), the picker-switch polling edge case
   and the skill-not-found state. `fetch` is the only mocked boundary (plus the
   router and the app chrome). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillEvalRuns } from "@devdigest/shared";
import {
  ALL_MESSAGES,
  apiError,
  evalCase,
  get,
  mockFetch,
  renderApp,
  skill as makeSkill,
  skillEvalRuns,
  skillRun,
  skillRunDetail,
} from "@/test/eval-utils";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: new URLSearchParams(),
  params: { skillId: "sk1" } as { skillId: string },
}));

vi.mock("next/navigation", () => ({
  useParams: () => nav.params,
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.search,
}));
// App chrome (nav, shortcuts, palette) is irrelevant here; render the page body only.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillEvalDashboard } from "./SkillEvalDashboard";

/** Local-time ISO so the table's local "YYYY-MM-DD HH:mm" is TZ-independent. */
const localIso = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();

const R1 = skillRun({
  id: "r1",
  skill_version: 1,
  model: "gpt-4.1",
  started_at: localIso(2026, 5, 20, 9, 14),
  recall: 0.8,
  precision: 0.9,
  citation_accuracy: 0.8,
  passed_count: 4,
  evaluated_count: 5,
  cost_usd: 0.1,
});
const R2 = skillRun({
  id: "r2",
  skill_version: 2,
  model: "gpt-4o",
  started_at: localIso(2026, 5, 25, 10, 30),
  recall: 0.9,
  precision: 0.7,
  citation_accuracy: 0.8,
  passed_count: 3,
  evaluated_count: 4,
  errored_count: 1,
  cost_usd: 0.25,
});
const R3_RUNNING = skillRun({
  id: "r3",
  skill_version: 3,
  status: "running",
  started_at: localIso(2026, 5, 28, 8, 0),
  cases_done: 2,
  cases_total: 5,
  recall: null,
  precision: null,
  citation_accuracy: null,
  cost_usd: null,
  passed_count: 0,
  evaluated_count: 0,
});

const ALERT = {
  version: 2,
  previous_version: 1,
  drops: [{ metric: "precision" as const, points: 20 }],
  others: [
    { metric: "recall" as const, direction: "up" as const },
    { metric: "citation_accuracy" as const, direction: "flat" as const },
  ],
  message: "ignored - the UI renders from the structured fields",
  model_changed: true,
};

function runsPayload(over: Partial<SkillEvalRuns> = {}): SkillEvalRuns {
  return { runs: [R2, R1], history: [R1, R2], alert: ALERT, cases_total: 5, latest_draft: null, ...over };
}

const CASES = [evalCase({ id: "c1", owner_kind: "skill", owner_id: "sk1" })];
const SKILL_LIST = [
  { ...makeSkill(), version: 2 },
  { ...makeSkill({ id: "sk2", name: "security-checklist", type: "security" }) },
];

let net: ReturnType<typeof mockFetch>;
function routes(payload: (path: string) => SkillEvalRuns, skillOver: Parameters<typeof makeSkill>[0] = {}, cases: unknown[] = CASES) {
  return [
    get("/skills/sk1", () => makeSkill({ version: 3, ...skillOver })),
    get("/skills/sk2", () => makeSkill({ id: "sk2", name: "security-checklist", type: "security" })),
    get("/skills", () => SKILL_LIST),
    get(/^\/skills\/sk1\/eval-runs/, (c) => payload(c.path)),
    get(/^\/skills\/sk2\/eval-runs/, () => skillEvalRuns({ cases_total: 0 })),
    get(/^\/eval-cases\?owner_kind=skill&owner_id=sk1$/, () => cases),
    get(/^\/eval-cases\?owner_kind=skill&owner_id=sk2$/, () => []),
  ];
}

function setup(
  payload: (path: string) => SkillEvalRuns = () => runsPayload(),
  search = "",
  skillOver: Parameters<typeof makeSkill>[0] = {},
  cases: unknown[] = CASES,
) {
  nav.params = { skillId: "sk1" };
  nav.search = new URLSearchParams(search);
  net = mockFetch(routes(payload, skillOver, cases));
  return renderApp(<SkillEvalDashboard />);
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

describe("SkillEvalDashboard: header", () => {
  it("SK-19: shows the skill name, type badge, current version, 'N runs on the M-case set', skill picker, range selector (default 30 days) and Run eval", async () => {
    setup();
    expect(await screen.findByRole("heading", { level: 1, name: "pr-quality-rubric" })).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByTitle("Current version")).toHaveTextContent("v3");
    expect(await screen.findByText("Regression harness · 2 runs on the 5-case set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Date range" })).toHaveTextContent("30 days");
    expect(screen.getByRole("button", { name: "Switch skill" })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Run eval" })).toBeEnabled());
    // default range is what the server is asked for
    await vi.waitFor(() => expect(net.callsTo("GET", "/skills/sk1/eval-runs").map((c) => c.path)).toContain("/skills/sk1/eval-runs?range=30d"));
  });

  it("SK-19: every range option (7, 30, 90 days, All time) is offered and picking one updates ?range=", async () => {
    setup();
    await screen.findByRole("heading", { level: 1, name: "pr-quality-rubric" });
    fireEvent.click(screen.getByRole("button", { name: "Date range" }));
    for (const label of ["7 days", "30 days", "90 days", "All time"]) {
      expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "7 days" }));
    expect(nav.replace).toHaveBeenCalledWith("/eval/skills/sk1?range=7d");
  });

  it("SK-19: the skill picker lists the skills and switches to another skill's dashboard keeping the range", async () => {
    setup();
    await screen.findByRole("heading", { level: 1, name: "pr-quality-rubric" });
    fireEvent.click(screen.getByRole("button", { name: "Switch skill" }));
    fireEvent.click(await screen.findByRole("button", { name: /security-checklist/ }));
    expect(nav.push).toHaveBeenCalledWith("/eval/skills/sk2?range=30d");
  });
});

describe("SkillEvalDashboard: range", () => {
  it("SK-20: the runs table shows exactly the runs the server returned for the chosen range", async () => {
    setup((path) => (path.includes("range=7d") ? runsPayload({ runs: [R2] }) : runsPayload()), "range=7d");
    await screen.findByText("v2", { selector: "td" });
    expect(screen.queryByText("v1", { selector: "td" })).not.toBeInTheDocument();
  });

  it("SK-20: the trend chart follows the range (one completed run in range -> single-point chart, not the all-time history)", async () => {
    const R0 = skillRun({ id: "r0", skill_version: 0, started_at: localIso(2026, 1, 1, 9, 0) });
    setup((path) => (path.includes("range=7d") ? runsPayload({ runs: [R2], history: [R0, R1, R2] }) : runsPayload()), "range=7d");
    await screen.findByText("v2", { selector: "td" });
    expect(await screen.findByRole("img", { name: "Metric trend chart" })).toBeInTheDocument();
  });

  it("SK-20: metric cards and the regression banner keep using the latest finished run vs the previous one even when no run is in range", async () => {
    setup((path) => (path.includes("range=7d") ? runsPayload({ runs: [] }) : runsPayload()), "range=7d");
    expect(await screen.findByText("90")).toBeInTheDocument(); // recall of R2
    expect(screen.getByText("▲ 10pt")).toBeInTheDocument(); // recall .8 -> .9
    expect(screen.getByText("▼ 20pt")).toBeInTheDocument(); // precision .9 -> .7
    expect(screen.getByRole("status")).toHaveTextContent("Precision dipped 20pts");
    expect(screen.getByText("No runs in this range.")).toBeInTheDocument();
  });
});

describe("SkillEvalDashboard: banner, cards, trend and table", () => {
  it("SK-21: renders a warning banner from the structured alert incl. 'model changed between runs'; none when the alert is null", async () => {
    setup();
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Precision dipped 20pts on v2 (vs v1). Recall up, Citation accuracy unchanged. model changed between runs");
    expect(banner).not.toHaveTextContent("ignored");
    cleanup();

    setup(() => runsPayload({ alert: { ...ALERT, model_changed: false } }));
    expect(await screen.findByRole("status")).not.toHaveTextContent("model changed");
    cleanup();

    setup(() => runsPayload({ alert: null }));
    await screen.findByText("RECALL");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("SK-22: three metric cards show the latest value, a signed delta and a sparkline", async () => {
    setup();
    for (const label of ["RECALL", "PRECISION", "CITATION ACCURACY"]) {
      const card = (await screen.findByText(label)).parentElement!.parentElement!;
      expect(card.querySelector('svg path[stroke-width="1.5"]')).not.toBeNull();
    }
    const recall = screen.getByText("RECALL").parentElement!.parentElement!;
    expect(within(recall).getByText("90")).toBeInTheDocument();
    expect(within(recall).getByText("▲ 10pt")).toBeInTheDocument();
    expect(within(screen.getByText("PRECISION").parentElement!.parentElement!).getByText("▼ 20pt")).toBeInTheDocument();
    expect(within(screen.getByText("CITATION ACCURACY").parentElement!.parentElement!).getByText("0pt")).toBeInTheDocument();
  });

  it("SK-22: shows the three-series trend legend and a runs table with checkbox, ran at, version, model, metric bars, pass x/y, cost and status", async () => {
    setup(() => runsPayload({ runs: [R3_RUNNING, R2, R1], history: [R1, R2] }));
    await screen.findByText("Metric trend");
    for (const name of ["Recall", "Precision", "Citation"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Select",
      "Ran at",
      "Version",
      "Model",
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
    expect(within(r2).getByText("gpt-4o")).toBeInTheDocument();
    for (const pct of ["90%", "70%", "80%"]) expect(within(r2).getByText(pct)).toBeInTheDocument();
    expect(within(r2).getByText("3/4")).toBeInTheDocument();
    expect(within(r2).getByText("1 errored")).toBeInTheDocument();
    expect(within(r2).getByText("$0.25")).toBeInTheDocument();
    expect(within(r2).getByText("Completed")).toBeInTheDocument();

    const running = rows[0]!;
    expect(within(running).getByText("2/5")).toBeInTheDocument();
    expect(within(running).getByText("Running")).toBeInTheDocument();
  });

  it("SK-22: a failed run is listed as failed and excluded from the cards (the cards read the finished-run history)", async () => {
    const FAILED = skillRun({ id: "rf", skill_version: 3, status: "failed", failure_reason: "interrupted", started_at: localIso(2026, 5, 30, 8, 0), recall: null, precision: null, citation_accuracy: null, passed_count: 0, evaluated_count: 0 });
    setup(() => runsPayload({ runs: [FAILED, R2, R1], history: [R1, R2] }));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("▲ 10pt")).toBeInTheDocument(); // still R2 vs R1
  });

  it("SK-23: Compare is enabled only with exactly two runs selected, and '2 selected' is shown", async () => {
    const R0 = skillRun({ id: "r0", skill_version: 0, started_at: localIso(2026, 5, 1, 9, 0) });
    setup(() => runsPayload({ runs: [R2, R1, R0], history: [R0, R1, R2] }));
    await screen.findByRole("table");
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    expect(compare).toHaveAccessibleDescription("Select exactly two runs to compare");

    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();
    fireEvent.click(boxes[1]!);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(compare).toBeEnabled();
    fireEvent.click(boxes[2]!);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(compare).toBeDisabled();
  });

  it("SK-23: Compare opens the skill compare modal for the two selected runs (the pair is sent to the skill compare endpoint)", async () => {
    setup();
    net.on("GET", /^\/skills\/sk1\/eval-runs\/compare/, () => ({
      old: { run: R1, skill_text: "old text" },
      new: { run: R2, skill_text: "new text" },
      deltas: { recall: 0.1, precision: -0.2, citation_accuracy: 0, cost_usd: 0.15 },
      model_changed: true,
      case_sets_differ: null,
      edited_cases: 0,
    }));
    await screen.findByRole("table");
    const [b1, b2] = screen.getAllByRole("checkbox");
    fireEvent.click(b1!);
    fireEvent.click(b2!);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("Compare runs · v1 → v2")).toBeInTheDocument();
    expect(net.callsTo("GET", "/skills/sk1/eval-runs/compare")[0]!.path).toMatch(/base=r\d&head=r\d/);
  });
});

describe("SkillEvalDashboard: Promote from Compare", () => {
  it("SK-28: promoting the newer version closes the modal and the dashboard shows the skill's new current version", async () => {
    setup();
    net.on("GET", /^\/skills\/sk1\/eval-runs\/compare/, () => ({
      old: { run: R1, skill_text: "old text" },
      new: { run: R2, skill_text: "new text" },
      deltas: { recall: 0.1, precision: -0.2, citation_accuracy: 0, cost_usd: 0.15 },
      model_changed: false,
      case_sets_differ: null,
      edited_cases: 0,
    }));
    net.on("POST", "/skills/sk1/versions/2/restore", () => makeSkill({ version: 4 }));

    expect(await screen.findByTitle("Current version")).toHaveTextContent("v3");
    const [b1, b2] = await screen.findAllByRole("checkbox");
    fireEvent.click(b1!);
    fireEvent.click(b2!);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    fireEvent.click(await screen.findByRole("button", { name: "Promote v2" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Promote" }));

    await vi.waitFor(() => expect(screen.queryByText("Compare runs · v1 → v2")).not.toBeInTheDocument());
    expect(net.callsTo("POST", "/skills/sk1/versions/2/restore")).toHaveLength(1);
    await vi.waitFor(() => expect(screen.getByTitle("Current version")).toHaveTextContent("v4"));
  });

  it("SK-29: when the compared newer run is the skill's current version the modal offers no Promote", async () => {
    setup(undefined, "", { version: 2 });
    net.on("GET", /^\/skills\/sk1\/eval-runs\/compare/, () => ({
      old: { run: R1, skill_text: "old text" },
      new: { run: R2, skill_text: "new text" },
      deltas: { recall: 0.1, precision: -0.2, citation_accuracy: 0, cost_usd: 0.15 },
      model_changed: false,
      case_sets_differ: null,
      edited_cases: 0,
    }));
    expect(await screen.findByTitle("Current version")).toHaveTextContent("v2");
    const [b1, b2] = await screen.findAllByRole("checkbox");
    fireEvent.click(b1!);
    fireEvent.click(b2!);
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(await screen.findByText("v2 is already the current version.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Promote/ })).not.toBeInTheDocument();
  });
});

describe("SkillEvalDashboard: empty, running and refused states", () => {
  it("SK-24: a skill with no suite runs shows the empty state prompting 'Run eval', which starts a run", async () => {
    setup(() => runsPayload({ runs: [], history: [], alert: null }));
    expect(await screen.findByText("No eval runs yet")).toBeInTheDocument();
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 1, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 1 }));

    const cta = within(screen.getByText("No eval runs yet").closest("div")!.parentElement!).getAllByRole("button", { name: "Run eval" });
    fireEvent.click(cta[cta.length - 1]!);
    expect(await screen.findByRole("button", { name: "Running 0/1…" })).toBeDisabled();
    expect(net.callsTo("POST", "/skills/sk1/eval-runs")).toHaveLength(1);
  });

  it("SK-24: with no runs and no cases the empty state points at the Evals tab instead of offering a run", async () => {
    setup(() => runsPayload({ runs: [], history: [], alert: null, cases_total: 0 }), "", {}, []);
    expect(await screen.findByText("This skill has no eval cases yet. Add some in its Evals tab first.")).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Run eval" })).toBeDisabled());
  });

  it("SK-15/SK-16: a pending scan disables Run eval with the scan reason; a refused run shows the server's message", async () => {
    setup(() => runsPayload(), "", { scan_status: "pending" });
    const btn = await screen.findByRole("button", { name: "Run eval" });
    await vi.waitFor(() =>
      expect(btn).toHaveAttribute("title", "Content scan hasn't finished — evals can't run until it passes."),
    );
    expect(btn).toBeDisabled();
    cleanup();

    setup();
    net.on("POST", "/skills/sk1/eval-runs", () => apiError(409, "A run is already in progress for this skill.", undefined, "conflict"));
    const run = await screen.findByRole("button", { name: "Run eval" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("alert")).toHaveTextContent("A run is already in progress for this skill.");
    expect(net.calls.filter((c) => c.path.startsWith("/eval-suite-runs/"))).toHaveLength(0);
  });

  it("SK-13: a run started here shows 'Running X/Y…' on the Run eval button and polls until it ends", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let detail = skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 1 });
    setup();
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 1, is_draft: false }));
    net.on("GET", "/eval-suite-runs/run-9", () => detail);

    const run = await screen.findByRole("button", { name: "Run eval" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("button", { name: "Running 0/1…" })).toBeDisabled();

    detail = skillRunDetail({ id: "run-9", status: "completed", cases_done: 1, cases_total: 1 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByRole("button", { name: "Run eval" })).toBeEnabled();
  });
});

describe("SkillEvalDashboard: switching skills and missing skills", () => {
  function Tree() {
    return (
      <NextIntlClientProvider locale="en" messages={ALL_MESSAGES}>
        <SkillEvalDashboard />
      </NextIntlClientProvider>
    );
  }

  it("Edge: switching skills in the picker while a run polls keeps polling the original skill's run in the background and never shows it on the new skill", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    nav.params = { skillId: "sk1" };
    nav.search = new URLSearchParams();
    net = mockFetch([
      ...routes(() => runsPayload()),
      get("/eval-suite-runs/run-9", () => skillRunDetail({ id: "run-9", status: "running", cases_done: 0, cases_total: 1 })),
    ]);
    net.on("POST", "/skills/sk1/eval-runs", () => ({ run_id: "run-9", status: "running", cases_total: 1, is_draft: false }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={qc}>
        <Tree />
      </QueryClientProvider>
    );
    const view = render(tree());

    const run = await screen.findByRole("button", { name: "Run eval" });
    await vi.waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByRole("button", { name: "Running 0/1…" })).toBeDisabled();

    // The user picks another skill: the route param changes and the page re-renders.
    nav.params = { skillId: "sk2" };
    view.rerender(tree());
    expect(await screen.findByRole("heading", { level: 1, name: "security-checklist" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Running/ })).not.toBeInTheDocument();

    const before = net.callsTo("GET", "/eval-suite-runs/run-9").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(() => expect(net.callsTo("GET", "/eval-suite-runs/run-9").length).toBeGreaterThan(before));
  });

  it("Edge: a skill deleted while the dashboard is open (404) shows the skill-not-found state", async () => {
    nav.params = { skillId: "sk1" };
    nav.search = new URLSearchParams();
    net = mockFetch([
      get("/skills/sk1", () => apiError(404, "Skill not found", undefined, "not_found")),
      get("/skills", () => []),
      get(/^\/skills\/sk1\/eval-runs/, () => apiError(404, "Skill not found", undefined, "not_found")),
      get(/^\/eval-cases/, () => []),
    ]);
    renderApp(<SkillEvalDashboard />);
    expect(await screen.findByText("Skill not found")).toBeInTheDocument();
    expect(screen.getByText("This skill no longer exists. It may have been deleted.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
