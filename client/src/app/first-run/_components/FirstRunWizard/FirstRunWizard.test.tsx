/* FirstRunWizard — opens on the first unfinished step, never auto-advances
   when a verified key refreshes secrets-status, and leaves when nothing is left. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { get, mockFetch, post, renderApp } from "@/test/eval-utils";
import { FirstRunWizard } from "./FirstRunWizard";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

const none = { openai: false, anthropic: false, openrouter: false, github: false };
const repo = { id: "r1", full_name: "acme/api" };

describe("FirstRunWizard", () => {
  it("skips a step whose key is already configured (e.g. via .env)", async () => {
    mockFetch([get("/settings/secrets-status", () => ({ ...none, openai: true })), get("/repos", () => [])]);
    renderApp(<FirstRunWizard />);

    expect(await screen.findByRole("heading", { name: "Connect GitHub" })).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 3/)).toBeInTheDocument();
  });

  it("stays on the step after verifying until the user clicks Continue", async () => {
    let status = none;
    const api = mockFetch([
      get("/settings/secrets-status", () => status),
      get("/repos", () => []),
      post("/settings/test-connection", () => {
        status = { ...none, openai: true };
        return { provider: "openai", ok: true, message: "OK — 3 models available" };
      }),
    ]);
    renderApp(<FirstRunWizard />);

    await screen.findByRole("heading", { name: "Connect your model provider" });
    fireEvent.change(screen.getByLabelText("API key", { selector: "input" }), { target: { value: "sk-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText(/Connection verified/);
    await waitFor(() => expect(api.callsTo("GET", "/settings/secrets-status")).toHaveLength(2));

    expect(screen.getByRole("heading", { name: "Connect your model provider" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("heading", { name: "Connect GitHub" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Connect your model provider" })).toBeInTheDocument();
  });

  it("adds the first repo and opens its PR list; Skip goes home", async () => {
    const all = { ...none, anthropic: true, github: true };
    const api = mockFetch([get("/settings/secrets-status", () => all), get("/repos", () => []), post("/repos", () => repo)]);
    renderApp(<FirstRunWizard />);

    await screen.findByRole("heading", { name: "Add your first repository" });
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(replace).toHaveBeenLastCalledWith("/");

    fireEvent.change(screen.getByLabelText("Repository URL", { selector: "input" }), {
      target: { value: "https://github.com/acme/api" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith("/repos/r1/pulls"));
    expect(api.callsTo("POST", "/repos")).toHaveLength(1);
  });

  it("goes home when everything is already set up", async () => {
    mockFetch([get("/settings/secrets-status", () => ({ ...none, openai: true, github: true })), get("/repos", () => [repo])]);
    renderApp(<FirstRunWizard />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
