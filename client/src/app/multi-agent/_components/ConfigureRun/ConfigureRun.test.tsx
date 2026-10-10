import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import runsMessages from "../../../../../messages/en/runs.json";
import { apiError, get, mockFetch } from "@/test/eval-utils";
import { ConfigureRun } from "./ConfigureRun";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/contexts", () => ({ useActiveRepo: () => ({ activeRepo: { id: "r1" } }) }));

const pr = (id: string, number: number, status = "open") => ({ id, number, title: `PR ${number}`, status });
const agent = (id: string, name: string, enabled = true) => ({ id, name, description: `${name} desc`, enabled });
const estimates = {
  review_concurrency: 3,
  agents: [
    { agent_id: "a1", agent_name: "Security", mean_duration_ms: 8200, mean_cost_usd: 0.06, sample_size: 4 },
    { agent_id: "a2", agent_name: "Perf", mean_duration_ms: null, mean_cost_usd: null, sample_size: 0 },
  ],
};

function setup(over: { pulls?: unknown[]; agents?: unknown[] } = {}) {
  const f = mockFetch([
    get("/repos/r1/pulls", () => over.pulls ?? [pr("p1", 482), pr("p2", 483), pr("p3", 1, "closed")]),
    get("/agents", () => over.agents ?? [agent("a1", "Security"), agent("a2", "Perf"), agent("a3", "Off", false)]),
    get("/multi-agent-runs/estimates", () => estimates),
    get("/multi-agent-runs", () => []),
  ]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages }}>
        <ConfigureRun />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return f;
}

const pickPr = async (label: string) => {
  fireEvent.click(await screen.findByText("Select a pull request…"));
  fireEvent.click(await screen.findByText(label));
};

beforeEach(() => {
  push.mockReset();
  search = "";
});

describe("ConfigureRun", () => {
  it("shows title, steps, placeholder and the dashed empty state with a disabled run button (AC-1,4,10)", async () => {
    setup();
    expect(screen.getByText("Run a Multi-Agent Review")).toBeInTheDocument();
    expect(screen.getByText("Pull request")).toBeInTheDocument();
    expect(await screen.findByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review \(0\)/ })).toBeDisabled();
  });

  it("lists only open PRs as '#n · title' (AC-2)", async () => {
    setup();
    fireEvent.click(await screen.findByText("Select a pull request…"));
    expect(await screen.findByText("#482 · PR 482")).toBeInTheDocument();
    expect(screen.getByText("#483 · PR 483")).toBeInTheDocument();
    expect(screen.queryByText("#1 · PR 1")).not.toBeInTheDocument();
  });

  it("preselects a valid ?pr id and ignores an invalid one (AC-3)", async () => {
    search = "pr=p2";
    setup();
    expect(await screen.findByText("#483 · PR 483")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
  });

  it("does not preselect an unknown ?pr id", async () => {
    search = "pr=nope";
    setup();
    expect(await screen.findByText("Pick a pull request first")).toBeInTheDocument();
  });

  it("renders enabled agent cards with estimates and '—' when missing (AC-5,6)", async () => {
    search = "pr=p1";
    setup();
    expect(await screen.findByText("8.2s · $0.06")).toBeInTheDocument();
    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.getByText("Security desc")).toBeInTheDocument();
    expect(screen.queryByText("Off")).not.toBeInTheDocument();
  });

  it("Select all checks every card; total and incomplete label appear (AC-7,8,9,10)", async () => {
    search = "pr=p1";
    setup();
    fireEvent.click(await screen.findByText("Select all"));
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Run multi-agent review \(2\)/ })).toBeEnabled();
    expect(await screen.findByText(/≈ 8\.2s · \$0\.06 · parallel fan-out/)).toBeInTheDocument();
    expect(screen.getByText("incomplete — 1 agent without history")).toBeInTheDocument();
  });

  it("posts exactly the checked ids and navigates on success (AC-11)", async () => {
    search = "pr=p1";
    const f = setup();
    f.on("POST", "/pulls/p1/review", () => ({ run_ids: ["x"], multi_agent_run_id: "m9" }));
    fireEvent.click(await screen.findByText("Security"));
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/m9"));
    expect(f.callsTo("POST", "/pulls/p1/review")[0]!.body).toEqual({ agentIds: ["a1"] });
  });

  it("409 shows an inline error linking to the in-flight run, selection kept (AC-12)", async () => {
    search = "pr=p1";
    const f = setup();
    f.on("POST", "/pulls/p1/review", () => apiError(409, "busy", { multi_agent_run_id: "m5" }, "review_in_progress"));
    fireEvent.click(await screen.findByText("Security"));
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ }));
    const link = await screen.findByRole("link", { name: "View the running multi-agent review" });
    expect(link).toHaveAttribute("href", "/multi-agent/m5");
    expect(screen.getByText("A review is already running for this PR.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("409 without a multi run links to the PR page", async () => {
    search = "pr=p1";
    const f = setup();
    f.on("POST", "/pulls/p1/review", () => apiError(409, "busy", { run_ids: ["r"], multi_agent_run_id: null }, "review_in_progress"));
    fireEvent.click(await screen.findByText("Security"));
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ }));
    const link = await screen.findByRole("link", { name: "Open the pull request" });
    expect(link).toHaveAttribute("href", "/repos/r1/pulls/482");
  });

  it("other failures show the error, keep selection and re-enable the button (AC-13)", async () => {
    search = "pr=p1";
    const f = setup();
    f.on("POST", "/pulls/p1/review", () => apiError(500, "boom"));
    fireEvent.click(await screen.findByText("Security"));
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ }));
    expect(await screen.findByText("Could not start the review: boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ })).toBeEnabled();
  });

  it("disables the button while starting so a double click sends one request (AC-14)", async () => {
    search = "pr=p1";
    const f = setup();
    f.on("POST", "/pulls/p1/review", () => ({ run_ids: [], multi_agent_run_id: "m1" }));
    fireEvent.click(await screen.findByText("Security"));
    const btn = screen.getByRole("button", { name: /Run multi-agent review \(1\)/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(f.callsTo("POST", "/pulls/p1/review")).toHaveLength(1);
  });

  it("shows the enable-agents empty state when no agent is enabled (AC-15)", async () => {
    setup({ agents: [agent("a3", "Off", false)] });
    expect(await screen.findByText("Enable agents to run reviews")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Go to Agents"));
    expect(push).toHaveBeenCalledWith("/agents");
  });
});

