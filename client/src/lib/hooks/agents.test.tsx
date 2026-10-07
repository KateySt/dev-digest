/* useLinkedSkills — feeds FindingCard's "Turn into eval case" target picker (SK-34).
   `null` means "still loading" and must never be confused with "no skills". */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLinkedSkills } from "./agents";
import { apiError, get, mockFetch, skill as makeSkill } from "@/test/eval-utils";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const SKILLS = [
  makeSkill({ id: "sk1", name: "pr-quality-rubric" }),
  makeSkill({ id: "sk2", name: "security-checklist" }),
  makeSkill({ id: "sk3", name: "unlinked" }),
];

describe("useLinkedSkills", () => {
  it("SK-34: is null while the links or the skill list are loading, then the linked skills as {id, name} in link order", async () => {
    mockFetch([
      get("/agents/ag1/skills", () => [
        { agent_id: "ag1", skill_id: "sk2", order: 1 },
        { agent_id: "ag1", skill_id: "sk1", order: 0 },
      ]),
      get("/skills", () => SKILLS),
    ]);
    const { result } = renderHook(() => useLinkedSkills("ag1"), { wrapper: wrapper() });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual([
      { id: "sk1", name: "pr-quality-rubric" },
      { id: "sk2", name: "security-checklist" },
    ]);
  });

  it("is an empty list (not null) once loaded for an agent without links; links to a skill that no longer exists are dropped", async () => {
    mockFetch([get("/agents/ag1/skills", () => []), get("/skills", () => SKILLS)]);
    const none = renderHook(() => useLinkedSkills("ag1"), { wrapper: wrapper() });
    await waitFor(() => expect(none.result.current).toEqual([]));
    cleanup();

    mockFetch([get("/agents/ag1/skills", () => [{ agent_id: "ag1", skill_id: "gone", order: 0 }]), get("/skills", () => SKILLS)]);
    const gone = renderHook(() => useLinkedSkills("ag1"), { wrapper: wrapper() });
    await waitFor(() => expect(gone.result.current).toEqual([]));
  });

  it("degrades to an empty list when a fetch fails so the picker never blocks on it", async () => {
    mockFetch([get("/agents/ag1/skills", () => apiError(500, "boom")), get("/skills", () => SKILLS)]);
    const { result } = renderHook(() => useLinkedSkills("ag1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("is an empty list for an agentless review and makes no skill requests", () => {
    const net = mockFetch();
    const { result } = renderHook(() => useLinkedSkills(null), { wrapper: wrapper() });
    expect(result.current).toEqual([]);
    expect(net.calls).toHaveLength(0);
  });
});
