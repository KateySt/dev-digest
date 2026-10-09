/* SPEC-08 `/eval` tabs and the Skills overview (SK-30..33). `fetch` is the only
   mocked boundary (plus the router and the app chrome). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import type { EvalCrossAgentDashboard, EvalCrossSkillDashboard, EvalDashboardSkill } from "@devdigest/shared";
import { get, mockFetch, renderApp, skill as makeSkill, skillRun, suiteRun } from "@/test/eval-utils";

const nav = vi.hoisted(() => ({ replace: vi.fn(), search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => nav.search,
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = new URLSearchParams();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Local-time ISO so the displayed "YYYY-MM-DD HH:mm" is TZ-independent. */
const localIso = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).toISOString();

const LAST = skillRun({
  id: "sr-a",
  skill_id: "sk1",
  skill_version: 4,
  started_at: localIso(2026, 5, 29, 9, 14),
  recall: 0.85,
  precision: 0.9,
  citation_accuracy: 0.7,
  passed_count: 17,
  evaluated_count: 20,
});

const SKILL_ROWS: EvalDashboardSkill[] = [
  {
    skill_id: "sk1",
    skill_name: "pr-quality-rubric",
    enabled: true,
    scan_status: "clean",
    cases_total: 20,
    latest_run: LAST,
    history: [
      { recall: 0.7, precision: 0.8, citation_accuracy: 0.6 },
      { recall: 0.85, precision: 0.9, citation_accuracy: 0.7 },
    ],
    running_run: null,
  },
  { skill_id: "sk2", skill_name: "security-checklist", enabled: true, scan_status: "clean", cases_total: 3, latest_run: null, history: [], running_run: null },
  { skill_id: "sk3", skill_name: "empty-skill", enabled: true, scan_status: "clean", cases_total: 0, latest_run: null, history: [], running_run: null },
];

function skillsDashboard(over: Partial<EvalCrossSkillDashboard> = {}): EvalCrossSkillDashboard {
  return {
    skills: SKILL_ROWS.map((r) => ({ ...r })),
    recent_runs: [{ ...LAST, skill_name: "pr-quality-rubric" }],
    ...over,
  };
}

const AGENTS: EvalCrossAgentDashboard = {
  agents: [
    {
      agent_id: "ag1",
      agent_name: "Security Reviewer",
      model: "gpt-4.1",
      cases_total: 20,
      latest_run: suiteRun({ id: "run-a", agent_version: 7, started_at: localIso(2026, 5, 29, 9, 14) }),
      history: [{ recall: 0.8, precision: 0.8, citation_accuracy: 0.9 }],
      running_run: null,
    },
  ],
  recent_runs: [],
};

function setup(payload: () => EvalCrossSkillDashboard = () => skillsDashboard(), search = "tab=skills") {
  nav.search = new URLSearchParams(search);
  const net = mockFetch([
    get("/eval-dashboard", () => AGENTS),
    get("/eval-dashboard/skills", () => payload()),
    get("/skills", () => [
      makeSkill({ id: "sk1", name: "pr-quality-rubric", type: "rubric" }),
      makeSkill({ id: "sk2", name: "security-checklist", type: "security" }),
      makeSkill({ id: "sk3", name: "empty-skill", type: "custom" }),
    ]),
  ]);
  renderApp(<EvalDashboardView />);
  return net;
}

describe("EvalDashboardView: tabs", () => {
  it("SK-30: shows Agents and Skills tabs with the existing cross-agent content under Agents (the default)", async () => {
    setup(undefined, "");
    expect(await screen.findByRole("button", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Open Security Reviewer eval dashboard" })).toHaveAttribute("href", "/eval/ag1");
    expect(screen.getByRole("button", { name: "Run all agents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all skills" })).not.toBeInTheDocument();
  });

  it("SK-30: clicking Skills puts ?tab=skills in the URL; ?tab=skills renders the Skills content instead of Agents", async () => {
    setup(undefined, "");
    fireEvent.click(await screen.findByRole("button", { name: "Skills" }));
    expect(nav.replace).toHaveBeenCalledWith("/eval?tab=skills");
    cleanup();

    setup();
    expect(await screen.findByRole("button", { name: "Run all skills" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all agents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Security Reviewer eval dashboard" })).not.toBeInTheDocument();
  });

  it("SK-30: an unknown ?tab= value falls back to Agents", async () => {
    setup(undefined, "tab=bogus");
    expect(await screen.findByRole("button", { name: "Run all agents" })).toBeInTheDocument();
  });
});

describe("EvalDashboardView: Skills tab", () => {
  it("SK-31: lists every skill (name, type badge, 'Last run vN · date · x/y pass', sparkline, recall/prec/cite %, link to its dashboard) and a 'Recent eval runs · all skills' table", async () => {
    setup();
    const card = (await screen.findByRole("link", { name: "Open pr-quality-rubric eval dashboard" })) as HTMLElement;
    expect(card).toHaveAttribute("href", "/eval/skills/sk1");
    expect(within(card).getByText("pr-quality-rubric")).toBeInTheDocument();
    await vi.waitFor(() => expect(within(card).getByText("rubric")).toBeInTheDocument());
    expect(within(card).getByText("Last run v4 · 2026-05-29 09:14 · 17/20 pass")).toBeInTheDocument();
    expect(card.querySelector('svg path[stroke-width="1.5"]')).not.toBeNull();
    for (const label of ["RECALL", "PREC", "CITE"]) expect(within(card).getByText(label)).toBeInTheDocument();
    for (const v of ["85", "90", "70"]) expect(within(card).getByText(v)).toBeInTheDocument();

    // every skill gets a row, each linking to its own dashboard
    expect(screen.getByRole("link", { name: "Open security-checklist eval dashboard" })).toHaveAttribute("href", "/eval/skills/sk2");
    expect(screen.getByRole("link", { name: "Open empty-skill eval dashboard" })).toHaveAttribute("href", "/eval/skills/sk3");

    expect(screen.getByText("Recent eval runs · all skills")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Skill",
      "Ran at",
      "Version",
      "Recall",
      "Precision",
      "Citation",
      "Pass",
    ]);
    const row = within(table).getAllByRole("row")[1]!;
    for (const text of ["pr-quality-rubric", "2026-05-29 09:14", "v4", "85%", "90%", "70%", "17/20"]) {
      expect(within(row).getByText(text)).toBeInTheDocument();
    }
  });

  it("SK-32: a skill that was never run shows 'never run' and '—' metrics; a skill without cases shows 'no cases'", async () => {
    setup();
    const never = (await screen.findByRole("link", { name: "Open security-checklist eval dashboard" })) as HTMLElement;
    expect(within(never).getByText("never run")).toBeInTheDocument();
    expect(within(never).getAllByText("—")).toHaveLength(3);
    expect(never.querySelector('svg path[stroke-width="1.5"]')).toBeNull();

    const noCases = screen.getByRole("link", { name: "Open empty-skill eval dashboard" });
    expect(within(noCases).getByText("no cases")).toBeInTheDocument();
    expect(within(noCases).queryByText("never run")).not.toBeInTheDocument();
    expect(within(noCases).getAllByText("—")).toHaveLength(3);
  });

  it("SK-31: with no recent runs the table is replaced by an empty note", async () => {
    setup(() => skillsDashboard({ recent_runs: [] }));
    expect(await screen.findByText("No eval runs yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("SK-33: 'Run all skills' starts runs for eligible skills and reports how many were skipped", async () => {
    const net = setup();
    net.on("POST", "/eval-dashboard/skills/run-all", () => ({ started: ["sk1", "sk2"], skipped: ["sk3"] }));

    const btn = await screen.findByRole("button", { name: "Run all skills" });
    await vi.waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);

    expect(await screen.findByRole("status")).toHaveTextContent("Started 2 skills · 1 skipped");
    expect(net.callsTo("POST", "/eval-dashboard/skills/run-all")).toHaveLength(1);
    // the agents endpoint is untouched
    expect(net.callsTo("POST", "/eval-dashboard/run-all")).toHaveLength(0);
  });

  it("SK-33: with nothing skipped the notice has no skipped part", async () => {
    const net = setup();
    net.on("POST", "/eval-dashboard/skills/run-all", () => ({ started: ["sk1"], skipped: [] }));
    const btn = await screen.findByRole("button", { name: "Run all skills" });
    await vi.waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(await screen.findByRole("status")).toHaveTextContent(/^Started 1 skill$/);
  });

  it("SK-33: shows per-skill running state with progress, disables 'Run all skills' meanwhile, polls every 2s until the run finishes", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let running: { id: string; cases_done: number; cases_total: number } | null = { id: "s1", cases_done: 1, cases_total: 20 };
    const net = setup(() => {
      const d = skillsDashboard();
      d.skills[0] = { ...d.skills[0]!, running_run: running };
      return d;
    });

    expect(await screen.findByText("Running 1/20…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all skills" })).toBeDisabled();

    running = { id: "s1", cases_done: 12, cases_total: 20 };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByText("Running 12/20…")).toBeInTheDocument();

    running = null;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByText("Last run v4 · 2026-05-29 09:14 · 17/20 pass")).toBeInTheDocument();
    expect(screen.queryByText(/Running \d+\/20/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all skills" })).toBeEnabled();

    const settled = net.callsTo("GET", "/eval-dashboard/skills").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(net.callsTo("GET", "/eval-dashboard/skills")).toHaveLength(settled);
  });

  it("SK-33: 'Run all skills' is disabled when no skill has eval cases", async () => {
    const d = skillsDashboard();
    d.skills.forEach((s) => (s.cases_total = 0));
    setup(() => d);
    await screen.findByRole("link", { name: "Open pr-quality-rubric eval dashboard" });
    expect(screen.getByRole("button", { name: "Run all skills" })).toBeDisabled();
  });

  it("shows an empty state when there are no skills at all", async () => {
    setup(() => skillsDashboard({ skills: [], recent_runs: [] }));
    expect(await screen.findByText("No skills yet. Create a skill and add eval cases to start.")).toBeInTheDocument();
  });
});
