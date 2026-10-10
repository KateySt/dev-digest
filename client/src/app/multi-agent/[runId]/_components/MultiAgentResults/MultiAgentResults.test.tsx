import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgentColumn, FindingRecord, MultiAgentRun } from "@devdigest/shared";
import runsMessages from "@/../messages/en/runs.json";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import prReviewMessages from "@/../messages/en/prReview.json";
import evalMessages from "@/../messages/en/eval.json";
import { get, mockFetch, post } from "@/test/eval-utils";
import { MultiAgentResults } from "./MultiAgentResults";

/* ---- next/navigation: a tiny URL store so router.replace re-renders ---- */
let url = new URLSearchParams();
const listeners = new Set<() => void>();
const push = vi.fn();
const replace = vi.fn((href: string) => {
  url = new URLSearchParams(href.split("?")[1] ?? "");
  listeners.forEach((l) => l());
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/multi-agent/m1",
  useParams: () => ({ runId: "m1" }),
  useSearchParams: () => {
    const q = React.useSyncExternalStore(
      (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      () => url.toString(),
      () => url.toString(),
    );
    return new URLSearchParams(q);
  },
}));
// FindingCard is covered by its own tests (and imports the missing baseline module `@/lib/toast`),
// so it is stubbed to expose just what this view wires: expansion, own-id actions.
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/FindingCard", () => ({
  FindingCard: (p: { f: FindingRecord; defaultExpanded?: boolean; onAction?: (a: string) => void }) => (
    <div data-finding-id={p.f.id}>
      <span>{p.f.title}</span>
      {p.defaultExpanded && (
        <>
          <p>{`why ${p.f.title}`}</p>
          <button onClick={() => p.onAction?.("accept")}>Accept</button>
          <button disabled>Learn</button>
        </>
      )}
    </div>
  ),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer", () => ({
  default: (p: { runId: string; running?: boolean; queued?: boolean; onClose: () => void }) => (
    <div data-testid="drawer" data-run={p.runId} data-running={String(!!p.running)} data-queued={String(!!p.queued)}>
      <button onClick={p.onClose}>close drawer</button>
    </div>
  ),
}));

const finding = (id: string, title: string, over: Partial<FindingRecord> = {}): FindingRecord =>
  ({
    id,
    review_id: "rv",
    severity: "CRITICAL",
    category: "security",
    title,
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    confidence: 0.98,
    rationale: `why ${title}`,
    suggestion: null,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  }) as FindingRecord;

const col = (over: Partial<AgentColumn> & Pick<AgentColumn, "run_id" | "agent_id" | "agent_name">): AgentColumn => ({
  status: "done",
  queue_position: null,
  error: null,
  provider: null,
  model: null,
  verdict: null,
  score: 70,
  summary: "A summary",
  duration_ms: 8200,
  tokens_in: null,
  tokens_out: null,
  cost_usd: 0.06,
  findings: [],
  ...over,
});

function makeRun(columns: AgentColumn[], over: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "m1",
    pr_id: "p1",
    pr_number: 482,
    pr_title: "Add rate limiting",
    repo_id: "r1",
    ran_at: new Date().toISOString(),
    agent_count: columns.length,
    in_progress: columns.some((c) => c.status === "queued" || c.status === "running"),
    totals_partial: false,
    total_duration_ms: 8200,
    total_cost_usd: 0.2,
    columns,
    groups: [],
    conflicts: [],
    ...over,
  };
}

const sec = finding("f1", "Hardcoded key");
const perf = finding("f2", "N+1 query", { severity: "WARNING", category: "performance" as FindingRecord["category"] });
const DONE_COLS = [
  col({ run_id: "r1", agent_id: "a1", agent_name: "Security", score: 38, findings: [sec] }),
  col({ run_id: "r2", agent_id: "a2", agent_name: "Performance", score: 64, findings: [perf] }),
];
const GROUP = {
  id: "g:f1",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  representative_id: "f1",
  members: [
    { finding_id: "f1", agent_id: "a1", agent_name: "Security", severity: "CRITICAL" as const, confidence: 0.98, title: "Hardcoded key", rationale: "x", file: "src/config.ts", start_line: 12, end_line: 12 },
    { finding_id: "f2", agent_id: "a2", agent_name: "Performance", severity: "WARNING" as const, confidence: 0.8, title: "N+1 query", rationale: "y", file: "src/config.ts", start_line: 12, end_line: 12 },
  ],
};

function setup(run: MultiAgentRun | "404", routes: ReturnType<typeof get>[] = []) {
  const f = mockFetch([
    get("/multi-agent-runs/m1", () => (run === "404" ? { __status: 404, body: { error: { code: "not_found", message: "nope" } } } : run)),
    ...routes,
  ]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages, eval: evalMessages }}>
        <MultiAgentResults />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { f };
}

beforeEach(() => {
  url = new URLSearchParams();
  push.mockReset();
  replace.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MultiAgentResults", () => {
  it("shows the header, PR line, totals and Columns by default (AC-21, 27)", async () => {
    setup(makeRun(DONE_COLS));
    expect(await screen.findByRole("heading", { name: "Multi-Agent Review" })).toBeInTheDocument();
    expect(screen.getByText("2 selected agents · parallel")).toBeInTheDocument();
    expect(screen.getByText("Add rate limiting")).toBeInTheDocument();
    expect(screen.getByTestId("results-meta")).toHaveTextContent("2 agents · fan-out via shared queue · 8.2s total · $0.20");
    const columns = screen.getAllByTestId("agent-column");
    expect(columns).toHaveLength(2);
    expect(within(columns[0]!).getByText("8.2s · $0.06")).toBeInTheDocument();
    expect(within(columns[0]!).getByText("Hardcoded key")).toBeInTheDocument();
    expect(within(columns[0]!).getByText("1 finding")).toBeInTheDocument();
    expect(within(columns[0]!).getByText("View trace")).toBeInTheDocument();
  });

  it("navigates to Configure run with the PR id (AC-22)", async () => {
    setup(makeRun(DONE_COLS));
    fireEvent.click(await screen.findByRole("button", { name: "Configure run" }));
    expect(push).toHaveBeenCalledWith("/multi-agent?pr=p1");
  });

  it("marks partial totals and shows an em dash for unknown cost (AC-24)", async () => {
    setup(makeRun(DONE_COLS, { totals_partial: true, total_cost_usd: null, total_duration_ms: null }));
    const meta = await screen.findByTestId("results-meta");
    expect(meta).toHaveTextContent("so far (running)");
    expect(meta).toHaveTextContent("—");
    expect(meta).not.toHaveTextContent("$0.00");
  });

  it("renders queued, running, failed, cancelled and empty columns independently (AC-28..32)", async () => {
    setup(
      makeRun([
        col({ run_id: "q", agent_id: "a1", agent_name: "Queued Ag", status: "queued", queue_position: 2, score: null, duration_ms: null, cost_usd: null }),
        col({ run_id: "r", agent_id: "a2", agent_name: "Running Ag", status: "running", score: null, duration_ms: null, cost_usd: null }),
        col({ run_id: "f", agent_id: "a3", agent_name: "Failed Ag", status: "failed", error: "boom", score: null }),
        col({ run_id: "c", agent_id: "a4", agent_name: "Cancelled Ag", status: "cancelled", score: null }),
        col({ run_id: "e", agent_id: "a5", agent_name: "Empty Ag", findings: [] }),
      ]),
    );
    expect(await screen.findByText("Queued · #2 in line")).toBeInTheDocument();
    expect(screen.getByText(/^Running · \d+s$/)).toBeInTheDocument();
    expect(screen.getByTestId("column-skeleton")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText("No findings")).toBeInTheDocument();
    // unknown values never render as 0
    expect(screen.getAllByText("— · —").length).toBeGreaterThan(0);
    // 5 columns -> the scroller exists
    expect(screen.getByTestId("columns-scroller")).toBeInTheDocument();
  });

  it("cancels only that run from a queued/running column (AC-33)", async () => {
    const f = setup(
      makeRun([
        col({ run_id: "q", agent_id: "a1", agent_name: "Queued Ag", status: "queued", queue_position: 1, score: null }),
        col({ run_id: "r", agent_id: "a2", agent_name: "Running Ag", status: "running", score: null }),
      ]),
      [post("/runs/q/cancel", () => ({ ok: true }))],
    ).f;
    fireEvent.click(await screen.findByRole("button", { name: "Cancel Queued Ag" }));
    await waitFor(() => expect(f.callsTo("POST", "/runs/q/cancel")).toHaveLength(1));
    expect(f.callsTo("POST", "/runs/r/cancel")).toHaveLength(0);
  });

  it("Cancel all asks for confirmation, then calls the multi-run endpoint; hidden when terminal (AC-51)", async () => {
    const f = setup(
      makeRun([col({ run_id: "r", agent_id: "a2", agent_name: "Running Ag", status: "running", score: null })]),
      [post("/multi-agent-runs/m1/cancel", () => ({ cancelled_run_ids: ["r"] }))],
    ).f;
    fireEvent.click(await screen.findByRole("button", { name: "Cancel all" }));
    expect(f.callsTo("POST", "/multi-agent-runs/m1/cancel")).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel all" }));
    await waitFor(() => expect(f.callsTo("POST", "/multi-agent-runs/m1/cancel")).toHaveLength(1));
  });

  it("does not offer Cancel all once every agent is terminal (AC-51)", async () => {
    setup(makeRun(DONE_COLS));
    await screen.findByRole("heading", { name: "Multi-Agent Review" });
    expect(screen.queryByRole("button", { name: "Cancel all" })).not.toBeInTheDocument();
  });

  it("keeps the view in the URL and shows tabs with a summary card and expanded finding (AC-34, 35, 37)", async () => {
    setup(makeRun(DONE_COLS));
    fireEvent.click(await screen.findByRole("button", { name: "Tabs" }));
    expect(replace).toHaveBeenCalledWith("/multi-agent/m1?view=tabs", { scroll: false });
    expect(await screen.findByText("Security 38")).toBeInTheDocument();
    expect(screen.getByText("Performance 64")).toBeInTheDocument();
    expect(screen.getByTestId("agent-summary")).toHaveTextContent("A summary");
    // first finding expanded -> actions incl. disabled Learn
    expect(await screen.findByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Learn" })).toBeDisabled();
    fireEvent.click(screen.getByText("Performance 64"));
    expect(await screen.findByText("N+1 query")).toBeInTheDocument();
  });

  it("clicking a Columns card opens Tabs on that agent with the finding expanded (AC-52)", async () => {
    setup(makeRun(DONE_COLS));
    fireEvent.click(await screen.findByRole("button", { name: "Open N+1 query in Tabs view" }));
    expect(replace).toHaveBeenCalledWith("/multi-agent/m1?view=tabs", { scroll: false });
    expect(await screen.findByText("why N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded key")).not.toBeInTheDocument();
  });

  it("shows 'Also flagged by' on grouped cards in both modes (AC-38)", async () => {
    setup(makeRun(DONE_COLS, { groups: [GROUP] }));
    const first = (await screen.findAllByTestId("column-finding"))[0]!;
    expect(within(first).getByText("Also flagged by Performance")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(await screen.findByText("Also flagged by Performance")).toBeInTheDocument();
  });

  it("opens the existing trace drawer from View trace, keeps ?trace= and streams while running (AC-44, 45)", async () => {
    setup(
      makeRun([
        col({ run_id: "r", agent_id: "a2", agent_name: "Running Ag", status: "running", score: null }),
        col({ run_id: "d", agent_id: "a1", agent_name: "Done Ag", score: 50 }),
      ]),
    );
    const cols = await screen.findAllByTestId("agent-column");
    fireEvent.click(within(cols[0]!).getByText("View trace"));
    expect(replace).toHaveBeenCalledWith("/multi-agent/m1?trace=r", { scroll: false });
    const drawer = await screen.findByTestId("drawer");
    expect(drawer).toHaveAttribute("data-run", "r");
    expect(drawer).toHaveAttribute("data-running", "true");
    expect(drawer).toHaveAttribute("data-queued", "false");
    fireEvent.click(screen.getByText("close drawer"));
    expect(screen.queryByTestId("drawer")).not.toBeInTheDocument();
  });

  it("restores the drawer from ?trace= and marks queued runs as queued+running (AC-44, 45)", async () => {
    url = new URLSearchParams("trace=q");
    setup(makeRun([col({ run_id: "q", agent_id: "a1", agent_name: "Q", status: "queued", queue_position: 1, score: null })]));
    const drawer = await screen.findByTestId("drawer");
    expect(drawer).toHaveAttribute("data-running", "true");
    expect(drawer).toHaveAttribute("data-queued", "true");
  });

  it("shows a not-found state linking back to Configure run (AC-26)", async () => {
    setup("404");
    expect(await screen.findByText("Multi-agent run not found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Configure run" }));
    expect(push).toHaveBeenCalledWith("/multi-agent");
  });

  it("keeps the selected tab and URL state across 4 s polling while in flight (AC-23)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    url = new URLSearchParams("view=tabs");
    const { f } = setup(
      makeRun([
        ...DONE_COLS,
        col({ run_id: "r3", agent_id: "a3", agent_name: "Slow", status: "running", score: null }),
      ]),
    );
    fireEvent.click(await screen.findByText("Performance 64"));
    expect(await screen.findByText("N+1 query")).toBeInTheDocument();
    const before = f.callsTo("GET", "/multi-agent-runs/m1").length;
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await waitFor(() => expect(f.callsTo("GET", "/multi-agent-runs/m1").length).toBeGreaterThan(before));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded key")).not.toBeInTheDocument();
  });
});
