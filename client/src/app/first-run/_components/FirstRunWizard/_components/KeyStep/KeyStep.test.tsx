/* KeyStep — paste → verify (saves + live-tests the key) → continue. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { apiError, mockFetch, post, renderApp } from "@/test/eval-utils";
import { KeyStep } from "./KeyStep";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const none = { openai: false, anthropic: false, openrouter: false, github: false };

function setup(props: Partial<React.ComponentProps<typeof KeyStep>> = {}) {
  const onContinue = vi.fn();
  renderApp(
    <KeyStep
      providers={["openai", "anthropic", "openrouter"]}
      status={none}
      title="Connect your model provider"
      body="body"
      label="API key"
      onContinue={onContinue}
      {...props}
    />,
  );
  return { onContinue };
}

describe("KeyStep", () => {
  it("verifies the typed key with the selected provider, then lets the user continue", async () => {
    const api = mockFetch([post("/settings/test-connection", () => ({ provider: "anthropic", ok: true, message: "OK — 9 models available" }))]);
    const { onContinue } = setup();

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Anthropic" }));
    fireEvent.change(screen.getByLabelText("API key", { selector: "input" }), { target: { value: "  sk-ant-123 " } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/Connection verified · OK — 9 models available · \d+ms/);
    expect(api.callsTo("POST", "/settings/test-connection")[0]!.body).toEqual({ provider: "anthropic", key: "sk-ant-123" });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows the provider's failure message and keeps Continue locked", async () => {
    mockFetch([post("/settings/test-connection", () => ({ provider: "openai", ok: false, message: "401 Incorrect API key" }))]);
    const { onContinue } = setup();

    fireEvent.change(screen.getByLabelText("API key", { selector: "input" }), { target: { value: "sk-bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("status")).toHaveTextContent("401 Incorrect API key");
    expect(screen.queryByRole("button", { name: /continue/i })).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("shows a transport error inline", async () => {
    mockFetch([post("/settings/test-connection", () => apiError(429, "Too many requests"))]);
    setup();

    fireEvent.change(screen.getByLabelText("API key", { selector: "input" }), { target: { value: "sk-x" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Too many requests");
  });

  it("re-checks an already-configured key (e.g. from .env) on Continue, without retyping it", async () => {
    const api = mockFetch([post("/settings/test-connection", () => ({ provider: "openrouter", ok: true, message: "OK — 300 models available" }))]);
    const { onContinue } = setup({ status: { ...none, openrouter: true } });

    expect(screen.getByRole("button", { name: "OpenRouter" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Connected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(onContinue).toHaveBeenCalledOnce());
    expect(api.callsTo("POST", "/settings/test-connection")[0]!.body).toEqual({ provider: "openrouter" });
  });

  it("blocks Continue when the stored key no longer works", async () => {
    mockFetch([post("/settings/test-connection", () => ({ provider: "openai", ok: false, message: "401 Incorrect API key" }))]);
    const { onContinue } = setup({ status: { ...none, openai: true } });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("401 Incorrect API key");
    expect(screen.queryByText("Connected")).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
