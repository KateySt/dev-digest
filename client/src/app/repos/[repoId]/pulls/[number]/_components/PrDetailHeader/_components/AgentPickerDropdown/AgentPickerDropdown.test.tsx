import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import runsMessages from "../../../../../../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { mockFetch, get, post, apiError } from "@/test/eval-utils";
import { AgentPickerDropdown } from "./AgentPickerDropdown";
import { storageKey } from "./helpers";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const agent = (id: string, name: string, enabled = true) => ({ id, name, enabled, model: "m", provider: "p" });
const AGENTS = [agent("a1", "Security Reviewer"), agent("a2", "Performance Reviewer"), agent("a3", "Off", false)];
const ESTIMATES = {
  review_concurrency: 3,
  agents: [
    { agent_id: "a1", agent_name: "Security Reviewer", mean_duration_ms: 6000, mean_cost_usd: 0.01, sample_size: 4 },
    { agent_id: "a2", agent_name: "Performance Reviewer", mean_duration_ms: null, mean_cost_usd: null, sample_size: 0 },
  ],
};
const WORKSPACE = { workspaceId: "ws1", cloneDir: "/x", repos: [] };

function setup(extra: Parameters<typeof mockFetch>[0] = []) {
  const f = mockFetch([
    get("/agents", () => AGENTS),
    get("/multi-agent-runs/estimates", () => ESTIMATES),
    get("/workspace", () => WORKSPACE),
    ...extra,
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
        <AgentPickerDropdown prId="pr-9" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return f;
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Run Review/ }));
  await screen.findByText("Security Reviewer");
};

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AgentPickerDropdown", () => {
  it("shows title, Clear, a checkbox + estimate per enabled agent, run button, Configure (C-AC-16)", async () => {
    setup();
    await open();
    expect(screen.getByText("PICK AGENTS TO RUN")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByText("Off")).not.toBeInTheDocument();
    await screen.findByText("~6s");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review \(0\)/ })).toBeDisabled();
    expect(screen.getByText("Configure agents…")).toBeInTheDocument();
  });

  it("run button is disabled at 0 and enabled once an agent is checked (C-AC-17)", async () => {
    setup();
    await open();
    const [first] = screen.getAllByRole("checkbox");
    fireEvent.click(first!);
    expect(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ })).toBeEnabled();
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByRole("button", { name: /Run multi-agent review \(0\)/ })).toBeDisabled();
  });

  it("starts a multi-run, stores the selection and navigates (C-AC-18, C-AC-50)", async () => {
    const f = setup([post("/pulls/pr-9/review", () => ({ runs: [], multi_agent_run_id: "m1" }))]);
    await open();
    screen.getAllByRole("checkbox").forEach((c) => fireEvent.click(c));
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(2\)/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/m1"));
    expect(f.callsTo("POST", "/pulls/pr-9/review")[0]!.body).toEqual({ agentIds: ["a1", "a2"] });
    expect(JSON.parse(window.localStorage.getItem(storageKey("ws1"))!)).toEqual(["a1", "a2"]);
  });

  it("pre-checks the stored selection, ignoring ids no longer enabled (C-AC-50)", async () => {
    window.localStorage.setItem(storageKey("ws1"), JSON.stringify(["a2", "a3", "gone"]));
    setup();
    await open();
    await waitFor(() => {
      const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
      expect(boxes.map((b) => b.checked)).toEqual([false, true]);
    });
    expect(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ })).toBeInTheDocument();
  });

  it("shows a 409 in place with a link to the in-flight run (C-AC-18)", async () => {
    setup([
      post("/pulls/pr-9/review", () =>
        apiError(409, "busy", { run_ids: ["r1"], multi_agent_run_id: "m7" }, "review_in_progress"),
      ),
    ]);
    await open();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ }));
    expect(await screen.findByText("A review is already running for this PR.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("View the running multi-agent review"));
    expect(push).toHaveBeenCalledWith("/multi-agent/m7");
  });

  it("shows other failures in place", async () => {
    setup([post("/pulls/pr-9/review", () => apiError(500, "boom"))]);
    await open();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Run multi-agent review \(1\)/ }));
    expect(await screen.findByText("Could not start the review: boom")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Configure agents navigates with the PR id (C-AC-19)", async () => {
    setup();
    await open();
    fireEvent.click(screen.getByText("Configure agents…"));
    expect(push).toHaveBeenCalledWith("/multi-agent?pr=pr-9");
  });
});
