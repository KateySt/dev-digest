/* B8 / C-AC-20, C-AC-22, C-AC-24, C-AC-31, C-AC-32: poll ceiling for a
   generation that never produces a new tour. `fetch` is the only mocked
   boundary (plus router, app chrome and the unrelated suggestions card). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, cleanup, fireEvent, act, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { get, mockFetch, post } from "@/test/eval-utils";
import messages from "../../../../../../../messages/en/onboarding.json";
import { POLL_CEILING_MS } from "./constants";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));
vi.mock("./_components/SkillSuggestionsCard", () => ({ SkillSuggestionsCard: () => null }));

import { OnboardingView } from "./OnboardingView";

const TOUR = {
  state: "generated",
  index_status: "full",
  files_indexed: 10,
  files_discovered: 10,
  generated_at: "2026-10-07T00:00:00.000Z",
  blob_ref: "main",
  blob_ref_kind: "branch",
  schema_version: 1,
  reading_path: [],
  critical_paths: [],
  run_commands: [],
  env_keys: [],
  diagram_nodes: [],
  diagram_edges: [],
  architecture_md: "ARCH-MARKER",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <OnboardingView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OnboardingView poll ceiling", () => {
  it("B8 / C-AC-31 + C-AC-32 + C-AC-24: when generated_at never advances, polling stops at the ceiling, a failure message shows, Regenerate is re-enabled and the existing tour stays", async () => {
    // The job died: GET keeps returning the SAME generated_at forever.
    const f = mockFetch([
      get("/repos/r1/onboarding", () => TOUR),
      post("/repos/r1/onboarding/generate", () => ({ status: "accepted", jobId: "j1" })),
    ]);
    renderView();
    const regen = await screen.findByRole("button", { name: messages.regenerate });

    fireEvent.click(regen);
    expect(await screen.findByRole("button", { name: messages.regenerating })).toHaveProperty("disabled", true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_CEILING_MS + 1000);
    });

    expect(screen.getByText(messages.generateTimedOut)).toBeTruthy();
    const again = screen.getByRole("button", { name: messages.regenerate });
    expect(again).toHaveProperty("disabled", false);
    expect(screen.getByText(/ARCH-MARKER/)).toBeTruthy(); // existing tour intact

    // No further polling after the ceiling.
    const after = f.callsTo("GET", "/repos/r1/onboarding").length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(f.callsTo("GET", "/repos/r1/onboarding").length).toBe(after);
  });

  it("B8 / C-AC-20: before the ceiling the page keeps polling and Regenerate stays disabled", async () => {
    const f = mockFetch([
      get("/repos/r1/onboarding", () => TOUR),
      post("/repos/r1/onboarding/generate", () => ({ status: "accepted", jobId: "j1" })),
    ]);
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: messages.regenerate }));
    await screen.findByRole("button", { name: messages.regenerating });
    const before = f.callsTo("GET", "/repos/r1/onboarding").length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(f.callsTo("GET", "/repos/r1/onboarding").length).toBeGreaterThan(before);
    expect(screen.getByRole("button", { name: messages.regenerating })).toHaveProperty("disabled", true);
    expect(screen.queryByText(messages.generateTimedOut)).toBeNull();
  });
});
