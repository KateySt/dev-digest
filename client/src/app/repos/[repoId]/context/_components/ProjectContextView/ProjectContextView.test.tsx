/* B6 / C-AC-9, C-AC-29, C-AC-30: the resync refusal naming blocking paths.
   `fetch` is the only mocked boundary (plus router + app chrome). */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiError, get, mockFetch, post } from "@/test/eval-utils";
import contextMessages from "../../../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/contexts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contexts")>()),
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));

import { ProjectContextView } from "./ProjectContextView";

const LIST = { documents: [], last_refreshed_at: null, degraded: false };
const indexState = (reason?: string) => ({
  status: "full",
  filesIndexed: 1,
  filesSkipped: 0,
  lastIndexedSha: "s",
  updatedAt: "2026-10-07T00:00:00.000Z",
  reason,
});

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <ProjectContextView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProjectContextView resync refusal", () => {
  it("B6 / C-AC-29: a 409 project_context_blocked renders every details.paths entry and stops polling", async () => {
    const f = mockFetch([
      get("/repos/r1/context", () => LIST),
      get("/repos/r1/index-state", () => indexState()),
      post("/repos/r1/resync", () =>
        apiError(409, "blocked", { paths: ["docs/a.md", "specs/b.md"] }, "project_context_blocked"),
      ),
    ]);
    renderView();
    await screen.findByText(contextMessages.resync);

    fireEvent.click(screen.getByRole("button", { name: contextMessages.resync }));

    expect(await screen.findByText("docs/a.md")).toBeTruthy();
    expect(screen.getByText("specs/b.md")).toBeTruthy();
    expect(screen.getByText(contextMessages.refusal.title)).toBeTruthy();
    // Polling stopped: the button is back to its idle label and index-state is not hammered.
    await waitFor(() => expect(screen.getByRole("button", { name: contextMessages.resync })).toBeTruthy());
    const before = f.callsTo("GET", "/repos/r1/index-state").length;
    await new Promise((r) => setTimeout(r, 1800));
    expect(f.callsTo("GET", "/repos/r1/index-state").length).toBe(before);
  });

  it("B6 / C-AC-30: a persisted project_context_blocked reason in the index state renders the same refusal", async () => {
    mockFetch([
      get("/repos/r1/context", () => LIST),
      get("/repos/r1/index-state", () => indexState("project_context_blocked:docs/late.md,docs/x.md")),
    ]);
    renderView();

    expect(await screen.findByText("docs/late.md")).toBeTruthy();
    expect(screen.getByText("docs/x.md")).toBeTruthy();
    expect(screen.getByText(contextMessages.refusal.title)).toBeTruthy();
  });
});
