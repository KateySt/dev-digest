/* AccountMenu — the active GitHub user, plus desktop-only app actions. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { get, mockFetch, renderApp } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { AccountMenu } from "./AccountMenu";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  removeFakeBridge();
  push.mockReset();
});

const octocat = { login: "octocat", avatar_url: "https://github.com/octocat.png?size=64", html_url: "https://github.com/octocat" };

describe("AccountMenu", () => {
  it("shows the GitHub account behind the token", async () => {
    mockFetch([get("/settings/github-account", () => ({ account: octocat }))]);
    renderApp(<AccountMenu />);
    expect(await screen.findByRole("button", { name: "Account @octocat" })).toHaveTextContent("octocat");
    expect(screen.getByRole("img", { name: "octocat" })).toHaveAttribute("src", octocat.avatar_url);
  });

  it("offers Connect GitHub when there is no usable token", async () => {
    const api = mockFetch([get("/settings/github-account", () => ({ account: null }))]);
    renderApp(<AccountMenu />);
    await vi.waitFor(() => expect(api.callsTo("GET", "/settings/github-account")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(await screen.findByText("Connect GitHub"));
    expect(push).toHaveBeenCalledWith("/settings/api-keys");
  });

  it("carries the former Help-menu actions only in the desktop app", async () => {
    mockFetch([get("/settings/github-account", () => ({ account: octocat }))]);
    renderApp(<AccountMenu />);
    fireEvent.click(await screen.findByRole("button", { name: "Account @octocat" }));
    expect(screen.queryByText("Check for updates…")).toBeNull();
    cleanup();

    const { bridge } = installFakeBridge();
    mockFetch([get("/settings/github-account", () => ({ account: octocat }))]);
    renderApp(<AccountMenu />);
    fireEvent.click(await screen.findByRole("button", { name: "Account @octocat" }));
    fireEvent.click(await screen.findByText("Check for updates…"));
    expect(bridge.app.checkForUpdates).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Account @octocat" }));
    fireEvent.click(await screen.findByText("Open logs folder"));
    expect(bridge.app.openLogsFolder).toHaveBeenCalledOnce();
  });
});
