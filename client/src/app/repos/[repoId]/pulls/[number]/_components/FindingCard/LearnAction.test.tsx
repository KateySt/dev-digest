/* Learn → memory modal (SPEC-2026-10-12-memory AC-2..AC-7). fetch is the only mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { FindingRecord, LearnDraftResponse } from "@devdigest/shared";
import { finding as makeFinding, get, mockFetch, post, renderApp } from "@/test/eval-utils";
import { LearnAction } from "./LearnAction";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REPO = "00000000-0000-4000-8000-000000000001";
const AGENT = "00000000-0000-4000-8000-0000000000a1";
const F: FindingRecord = { ...makeFinding(), id: "f1", dismissed_at: "2026-10-01T00:00:00.000Z" };

const draft = (over: Partial<LearnDraftResponse> = {}): LearnDraftResponse => ({
  draft: {
    content: "Debug flags are config-driven here — do not flag them.",
    kind: "learning",
    scope: "repo",
    repo_id: REPO,
    path_globs: ["src/config.ts"],
    links: [{ target_kind: "agent", target_id: AGENT }],
    applies_to_all_agents: false,
    confidence: 0.82,
    fallback: false,
  },
  source: { pr: 7, context: "finding: Debug flag" },
  similar: [],
  existing_memory_id: null,
  ...over,
});

function routes(d: LearnDraftResponse) {
  return mockFetch([
    post("/findings/f1/learn/draft", () => d),
    get("/agents", () => [{ id: AGENT, name: "Security Reviewer" }]),
    get(/^\/skills/, () => []),
    get(/^\/memories\/similar/, () => []),
    post("/memories", (c) => ({ id: "m1", ...(c.body as object) })),
  ]);
}

const openModal = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Learn" }));
  return screen.findByText("Learn from this finding");
};

describe("LearnAction", () => {
  it("opens modal with drafted content", async () => {
    routes(draft());
    renderApp(<LearnAction f={F} />);
    await openModal();
    expect(await screen.findByDisplayValue("Debug flags are config-driven here — do not flag them.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "learning" })).toHaveAttribute("aria-pressed", "true");
  });

  it("Save posts finding_id with the edited draft", async () => {
    const api = routes(draft());
    renderApp(<LearnAction f={F} />);
    await openModal();
    const box = await screen.findByDisplayValue(/Debug flags are config-driven/);
    fireEvent.change(box, { target: { value: "Edited rule — because." } });
    fireEvent.click(screen.getByRole("button", { name: "Save to Memory" }));
    await waitFor(() => expect(api.callsTo("POST", "/memories")).toHaveLength(1));
    expect(api.callsTo("POST", "/memories")[0]!.body).toMatchObject({
      finding_id: "f1",
      content: "Edited rule — because.",
      kind: "learning",
      scope: "repo",
      repo_id: REPO,
      path_globs: ["src/config.ts"],
      links: [{ target_kind: "agent", target_id: AGENT }],
    });
    await waitFor(() => expect(screen.queryByText("Learn from this finding")).toBeNull());
  });

  it("Cancel sends nothing", async () => {
    const api = routes(draft());
    renderApp(<LearnAction f={F} />);
    await openModal();
    await screen.findByDisplayValue(/Debug flags/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Learn from this finding")).toBeNull();
    expect(api.callsTo("POST", "/memories")).toHaveLength(0);
  });

  it("fallback notice shown", async () => {
    routes(draft({ draft: { ...draft().draft, fallback: true } }));
    renderApp(<LearnAction f={F} />);
    await openModal();
    expect(await screen.findByText("Could not draft automatically — edit the text below.")).toBeTruthy();
  });

  it("Merge into this posts to the existing memory", async () => {
    const api = routes(
      draft({ similar: [{ id: "m9", content: "Existing near-duplicate.", kind: "learning", scope: "repo", similarity: 0.9 }] }),
    );
    api.on("POST", "/memories/m9/merge", () => ({ id: "m9" }));
    renderApp(<LearnAction f={F} />);
    await openModal();
    fireEvent.click(await screen.findByRole("button", { name: "Merge into this" }));
    await waitFor(() => expect(api.callsTo("POST", "/memories/m9/merge")).toHaveLength(1));
    expect(api.callsTo("POST", "/memories/m9/merge")[0]!.body).toMatchObject({ finding_id: "f1", confidence: 0.82 });
    expect(api.callsTo("POST", "/memories")).toHaveLength(0);
  });

  it("FIX: the duplicate check stays on the PR's repo even when scope is switched to All repos", async () => {
    const api = routes(draft());
    renderApp(<LearnAction f={F} />);
    await openModal();
    const box = await screen.findByDisplayValue(/Debug flags/);
    fireEvent.click(screen.getByRole("button", { name: "All repos" }));
    fireEvent.change(box, { target: { value: "Debug flags are config-driven in this codebase, never flag them." } });
    const similarCalls = () => api.calls.filter((c) => c.method === "GET" && c.path.startsWith("/memories/similar"));
    await waitFor(() => expect(similarCalls().length).toBeGreaterThan(0), { timeout: 2000 });
    const qs = new URLSearchParams(similarCalls().at(-1)!.path.split("?")[1]);
    expect(qs.get("repo_id")).toBe(REPO);
  });

  it("learned finding opens edit of existing memory", async () => {
    const api = routes(draft({ existing_memory_id: "m1" }));
    api.on("PATCH", "/memories/m1", (c) => ({ id: "m1", ...(c.body as object) }));
    renderApp(<LearnAction f={{ ...F, memory_id: "m1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    expect(await screen.findByText("Edit learned memory")).toBeTruthy();
    await screen.findByDisplayValue(/Debug flags/);
    fireEvent.click(screen.getByRole("button", { name: "Save to Memory" }));
    await waitFor(() => expect(api.callsTo("PATCH", "/memories/m1")).toHaveLength(1));
    expect(api.callsTo("POST", "/memories")).toHaveLength(0);
  });
});
