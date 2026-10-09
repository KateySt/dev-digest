/* B12 (bug fix, no AC): the "Last 7 days" `since` is captured when the toggle
   flips, so re-renders don't change the query key and refetch in a loop.
   `fetch` is the only mocked boundary (plus router/app chrome). */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { get, mockFetch } from "@/test/eval-utils";
import messages from "../../../../../messages/en/ci.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("CiRunsView since filter", () => {
  it("B12: toggling 'Last 7 days' sends ONE ?since= request and a plain re-render does not refetch", async () => {
    const f = mockFetch([get("/agents", () => []), get(/^\/ci-runs/, () => [])]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
    });
    const { rerender } = render(tree(client));
    await waitFor(() => expect(f.callsTo("GET", /^\/ci-runs/).length).toBe(1));

    fireEvent.click(screen.getByText(messages.runs.filters.last7Days));
    await waitFor(() => expect(f.callsTo("GET", /^\/ci-runs\?.*since=/).length).toBe(1));
    const sinceUrl = f.callsTo("GET", /^\/ci-runs\?.*since=/)[0]!.path;

    // Time passes and the component re-renders: `since` must not move.
    await new Promise((r) => setTimeout(r, 30));
    rerender(tree(client));
    rerender(tree(client));
    await new Promise((r) => setTimeout(r, 50));

    const sinceCalls = f.callsTo("GET", /^\/ci-runs\?.*since=/);
    expect(sinceCalls).toHaveLength(1);
    expect(sinceCalls[0]!.path).toBe(sinceUrl);
  });
});
