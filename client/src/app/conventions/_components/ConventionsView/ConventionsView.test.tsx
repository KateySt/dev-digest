/* Conventions page — sections, selection and skills built from a selection
   (SPEC-2026-10-16-convention-skills AC-13…AC-20). fetch is the only API mock. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ConventionCandidate } from "@devdigest/shared";
import { apiError, get, mockFetch, post, renderApp } from "@/test/eval-utils";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
// CodeMirror needs layout APIs jsdom lacks; the body editor is not under test.
vi.mock("@/components/code-field", () => ({
  CodeField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Skill body" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/contexts", () => ({
  useActiveRepo: () => ({ repoId: "r1", reposLoaded: true, activeRepo: { full_name: "acme/payments-api" } }),
  useToast: () => toast,
}));

import { ConventionsView } from "./ConventionsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.success.mockClear();
});

const conv = (over: Partial<ConventionCandidate>): ConventionCandidate => ({
  id: "c1",
  category: "errors",
  rule: "Rule",
  rationale: null,
  evidence_path: "src/a.ts",
  evidence_snippet: "x",
  evidence_line: 1,
  confidence: 0.9,
  status: "accepted",
  skill: null,
  ...over,
});

const SKILL = { id: "s1", name: "api-errors", repo_id: "r1" };

const LIST: ConventionCandidate[] = [
  conv({ id: "a1", rule: "Ready one" }),
  conv({ id: "a2", rule: "Ready two" }),
  conv({ id: "p1", rule: "Pending one", status: "pending" }),
  conv({ id: "u1", rule: "Used one", skill: SKILL }),
  conv({ id: "x1", rule: "Rejected one", status: "rejected" }),
];

function routes(list = LIST) {
  return mockFetch([get("/repos/r1/conventions", () => list)]);
}

const section = (name: RegExp) => screen.getByRole("region", { name });

describe("ConventionsView", () => {
  it("groups conventions into Ready / To review / Used in skills / Rejected (collapsed) — AC-13", async () => {
    routes();
    renderApp(<ConventionsView />);
    await screen.findByText("Ready one");

    expect(within(section(/^Ready for a skill$/)).getByText("Ready two")).toBeTruthy();
    expect(within(section(/^To review$/)).getByText("Pending one")).toBeTruthy();
    expect(within(section(/^Used in skills$/)).getByText("Used one")).toBeTruthy();
    expect(screen.queryByText("Rejected one")).toBeNull();

    fireEvent.click(within(section(/^Rejected \(1\)$/)).getByRole("button", { name: "Show" }));
    expect(screen.getByText("Rejected one")).toBeTruthy();
  });

  it("selection is local: ticking calls no API and drives the Create skill button — AC-14/AC-15", async () => {
    const api = routes();
    renderApp(<ConventionsView />);
    await screen.findByText("Ready one");

    const create = screen.getByRole("button", { name: /Create skill \(0\)/ });
    expect((create as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Select “Ready one”/ }));
    expect(screen.getByRole("button", { name: /Create skill \(1\)/ })).toBeTruthy();
    fireEvent.click(within(section(/^Ready for a skill$/)).getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: /Create skill \(2\)/ })).toBeTruthy();
    fireEvent.click(within(section(/^Ready for a skill$/)).getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: /Create skill \(0\)/ })).toBeTruthy();

    expect(api.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("creates a project-scoped skill from the selection only, then clears it — AC-16/AC-17", async () => {
    const api = routes();
    api.on("POST", "/repos/r1/conventions/skill", () => ({
      skill: { id: "s2", name: "payments-api-conventions", repo_id: "r1" },
      conventions: LIST.map((c) => (c.id === "a2" ? { ...c, skill: { id: "s2", name: "payments-api-conventions", repo_id: "r1" } } : c)),
    }));
    renderApp(<ConventionsView />);
    await screen.findByText("Ready one");

    fireEvent.click(screen.getByRole("checkbox", { name: /Select “Ready two”/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create skill \(1\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(api.callsTo("POST", "/repos/r1/conventions/skill")).toHaveLength(1));
    const body = api.callsTo("POST", "/repos/r1/conventions/skill")[0]!.body as Record<string, unknown>;
    expect(body.convention_ids).toEqual(["a2"]);
    expect(body.scope).toBe("repo");
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Created skill "payments-api-conventions" (project)'));
    expect(within(section(/^Used in skills$/)).getByText("Ready two")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create skill \(0\)/ })).toBeTruthy();
  });

  it("Global scope sends scope: global — AC-16", async () => {
    const api = routes();
    api.on("POST", "/repos/r1/conventions/skill", () => ({ skill: { id: "s3", name: "g", repo_id: null }, conventions: LIST }));
    renderApp(<ConventionsView />);
    await screen.findByText("Ready one");

    fireEvent.click(screen.getByRole("checkbox", { name: /Select “Ready one”/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create skill \(1\)/ }));
    const dialog = await screen.findByText("Scope");
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getByText("This project (acme/payments-api)"));
    fireEvent.click(await screen.findByText("Global (all projects)"));
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(api.callsTo("POST", "/repos/r1/conventions/skill")).toHaveLength(1));
    expect((api.callsTo("POST", "/repos/r1/conventions/skill")[0]!.body as { scope: string }).scope).toBe("global");
  });

  it("409 convention_unavailable keeps the modal open with an inline error and refetches — AC-18", async () => {
    const api = routes();
    api.on("POST", "/repos/r1/conventions/skill", () =>
      apiError(409, "taken", { ids: ["a1"] }, "convention_unavailable"),
    );
    renderApp(<ConventionsView />);
    await screen.findByText("Ready one");

    fireEvent.click(screen.getByRole("checkbox", { name: /Select “Ready one”/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Select “Ready two”/ }));
    fireEvent.click(screen.getByRole("button", { name: /Create skill \(2\)/ }));
    const before = api.callsTo("GET", "/repos/r1/conventions").length;
    fireEvent.click(await screen.findByRole("button", { name: "Create skill" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/already used or changed/);
    await waitFor(() => expect(api.callsTo("GET", "/repos/r1/conventions").length).toBeGreaterThan(before));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("Used in skills links to the skill, shows its scope and unlinks — AC-19/AC-20", async () => {
    const api = routes();
    api.on("PATCH", "/conventions/u1", () => conv({ id: "u1", rule: "Used one" }));
    renderApp(<ConventionsView />);
    await screen.findByText("Ready one");

    const used = section(/^Used in skills$/);
    expect(within(used).getByRole("link", { name: "Open skill api-errors" }).getAttribute("href")).toBe("/skills?skill=s1");
    expect(within(used).getByText("Project")).toBeTruthy();
    expect(within(used).queryByRole("button", { name: /^Reject/ })).toBeNull();
    expect(within(used).queryByRole("button", { name: /^Accept/ })).toBeNull();

    fireEvent.click(within(used).getByRole("button", { name: "Unlink: Used one" }));
    await waitFor(() => expect(api.callsTo("PATCH", "/conventions/u1")).toHaveLength(1));
    expect(api.callsTo("PATCH", "/conventions/u1")[0]!.body).toEqual({ skill_id: null });
  });
});
