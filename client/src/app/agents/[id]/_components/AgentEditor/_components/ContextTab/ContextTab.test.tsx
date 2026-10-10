/* B5 / client SPEC-04 AC-31..33 — the Context tab's optimistic, serialized,
   roll-back-on-failure attach. Only `fetch` and the active-repo context are
   mocked; the real TanStack hooks run against a fresh QueryClient. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { get, mockFetch, post } from "@/test/eval-utils";

vi.mock("@/lib/contexts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contexts")>()),
  useActiveRepo: () => ({ repoId: "r1" }),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;
const DOCS = ["docs/a.md", "docs/b.md", "docs/c.md"].map((path) => ({ path, size: 10, tokens: 5, source_folder: "docs" }));

/** Wrap the mocked fetch so each POST to the set-replace endpoint is held until
 *  released, letting a test observe the queue while a request is in flight. */
function gatedPosts(respond: (paths: string[]) => unknown) {
  const net = mockFetch([
    get(/^\/repos\/r1\/context/, () => ({ documents: DOCS, degraded: false })),
    get("/agents/ag1/context", () => []),
    post("/agents/ag1/context", (c) => respond((c.body as { paths: string[] }).paths)),
  ]);
  const inner = globalThis.fetch;
  const started: string[][] = [];
  const gates: Array<() => void> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET").toUpperCase() === "POST" && String(input).endsWith("/agents/ag1/context")) {
        started.push((JSON.parse(String(init!.body)) as { paths: string[] }).paths);
        await new Promise<void>((resolve) => gates.push(resolve));
      }
      return inner(input, init);
    }),
  );
  return { net, started, release: () => gates.shift()?.() };
}

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const boxes = () => screen.getAllByRole("checkbox");

describe("Agent ContextTab: optimistic serialized attach", () => {
  it("B5 / C-AC-31: a toggle shows immediately, before the server responds", async () => {
    const { started } = gatedPosts((paths) => paths.map((path, order) => ({ path, order })));
    renderTab();
    await screen.findByText("0 of 3 attached");

    fireEvent.click(boxes()[0]!);

    await waitFor(() => expect(boxes()[0]).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("1 of 3 attached")).toBeInTheDocument();
    expect(started).toEqual([["docs/a.md"]]); // request is still in flight
  });

  it("B5 / C-AC-32: two quick toggles are sent one at a time and the second POST carries both paths", async () => {
    const { started, release } = gatedPosts((paths) => paths.map((path, order) => ({ path, order })));
    renderTab();
    await screen.findByText("0 of 3 attached");

    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);

    // Serialized: the second request has not started while the first is in flight.
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]).toEqual(["docs/a.md"]);

    release();
    await waitFor(() => expect(started).toHaveLength(2));
    expect(started[1]).toEqual(["docs/a.md", "docs/b.md"]);
    release();
    await waitFor(() => expect(screen.getByText("2 of 3 attached")).toBeInTheDocument());
  });

  it("B5 / C-AC-33: a failed set-replace restores the last server-confirmed set", async () => {
    const { net, started, release } = gatedPosts(() => ({ __status: 500, body: {} }));
    net.routes.unshift({
      method: "POST",
      match: "/agents/ag1/context",
      respond: () => ({ __status: 500, body: { error: { code: "boom", message: "boom" } } }),
    });
    renderTab();
    await screen.findByText("0 of 3 attached");

    fireEvent.click(boxes()[0]!);
    await waitFor(() => expect(boxes()[0]).toHaveAttribute("aria-checked", "true")); // optimistic
    expect(started).toHaveLength(1);

    release(); // server answers 500
    await waitFor(() => expect(boxes()[0]).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByText("0 of 3 attached")).toBeInTheDocument();
  });
});
