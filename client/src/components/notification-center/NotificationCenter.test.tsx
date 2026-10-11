/* NotificationCenter — bell badge, dropdown list, read/remove actions, live stream. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { get, mockFetch, post, renderApp } from "@/test/eval-utils";
import type { AppNotification } from "@/lib/hooks";
import { NotificationCenter } from "./NotificationCenter";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** jsdom has no EventSource — a fake whose listeners the test can fire. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  listeners = new Map<string, (ev: MessageEvent) => void>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, fn: (ev: MessageEvent) => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => vi.stubGlobal("EventSource", FakeEventSource));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

const n = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1",
  kind: "review",
  status: "success",
  title: "Review done · PR #482",
  body: "acme/api — security-agent: 3 findings, score 72",
  href: "/repos/r1/pulls/482",
  read: false,
  created_at: new Date().toISOString(),
  ...over,
});

const del = (match: string | RegExp, respond: () => unknown) => ({ method: "DELETE", match, respond });

function setup(items: AppNotification[], unread = items.filter((i) => !i.read).length) {
  const api = mockFetch([
    get("/notifications", () => ({ items, unread })),
    post(/\/notifications\/.+\/read$/, () => ({ ok: true })),
    post("/notifications/read-all", () => ({ ok: true })),
    del(/\/notifications(\/.+)?$/, () => ({ ok: true })),
  ]);
  const onNotification = vi.fn();
  renderApp(<NotificationCenter onNotification={onNotification} />);
  return { api, onNotification };
}

const openPanel = async () => fireEvent.click(await screen.findByRole("button", { name: /^Notifications/ }));

describe("NotificationCenter", () => {
  it("shows the unread count on the bell and lists notifications", async () => {
    setup([n(), n({ id: "n2", title: "Eval · security-agent done", read: true })]);
    expect(await screen.findByRole("button", { name: "Notifications (1 unread)" })).toHaveTextContent("1");
    await openPanel();
    expect(screen.getByRole("button", { name: "Unread: Review done · PR #482" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eval · security-agent done" })).toBeInTheDocument();
    expect(screen.getByText("1 new")).toBeInTheDocument();
  });

  it("opening a notification marks it read and navigates to its result", async () => {
    const { api } = setup([n()]);
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Review done/ }));
    expect(push).toHaveBeenCalledWith("/repos/r1/pulls/482");
    await waitFor(() => expect(api.callsTo("POST", "/notifications/n1/read")[0]?.body).toEqual({ read: true }));
  });

  it("hover actions toggle read state and remove", async () => {
    const { api } = setup([n({ read: true })]);
    await openPanel();
    const row = await screen.findByRole("button", { name: /Review done/ });
    fireEvent.mouseEnter(row);
    fireEvent.click(screen.getByRole("button", { name: "Mark as unread" }));
    await waitFor(() => expect(api.callsTo("POST", "/notifications/n1/read")[0]?.body).toEqual({ read: false }));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api.callsTo("DELETE", "/notifications/n1")).toHaveLength(1));
    expect(push).not.toHaveBeenCalled();
  });

  it("marks all as read and clears all", async () => {
    const { api } = setup([n(), n({ id: "n2" })]);
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Mark all as read" }));
    fireEvent.click(screen.getByRole("button", { name: /Clear all/ }));
    await waitFor(() => {
      expect(api.callsTo("POST", "/notifications/read-all")).toHaveLength(1);
      expect(api.callsTo("DELETE", "/notifications")).toHaveLength(1);
    });
  });

  it("shows an empty state", async () => {
    setup([]);
    await openPanel();
    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });

  it("a streamed notification refreshes the list and is handed to onNotification", async () => {
    const { api, onNotification } = setup([]);
    await waitFor(() => expect(api.callsTo("GET", "/notifications")).toHaveLength(1));
    const fresh = n({ id: "n9", title: "Repository ready · acme/api" });
    act(() => FakeEventSource.last!.emit("notification", fresh));
    expect(onNotification).toHaveBeenCalledWith(fresh);
    await waitFor(() => expect(api.callsTo("GET", "/notifications")).toHaveLength(2));
  });
});
