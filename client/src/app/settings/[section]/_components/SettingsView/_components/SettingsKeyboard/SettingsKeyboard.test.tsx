/* Settings → Keyboard: rebind, disable, reset, conflicts, reserved combos,
   sequences, search (by name and by keys), single-key switch, global shortcuts. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { get, mockFetch, put, renderApp } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { KeyboardProvider } from "@/components/keyboard";
import { SettingsKeyboard } from "./SettingsKeyboard";

afterEach(() => {
  cleanup();
  removeFakeBridge();
  vi.restoreAllMocks();
});

function setup(settings: Record<string, unknown> = {}) {
  let current = settings;
  const api = mockFetch([
    get("/settings", () => current),
    put("/settings", (c) => (current = { ...current, ...(c.body as object) })),
  ]);
  renderApp(
    <KeyboardProvider>
      <SettingsKeyboard />
    </KeyboardProvider>,
  );
  const saved = () => (api.calls.filter((c) => c.method === "PUT").at(-1)?.body as { keybindings?: unknown })?.keybindings;
  return { api, saved };
}

const row = async (name: string) => (await screen.findByText(name)).closest("li")!;
const change = async (name: string) => {
  const r = await row(name);
  fireEvent.click(within(r).getByRole("button", { name: `Change shortcut for ${name}` }));
  return screen.getByRole("textbox", { name: `Recording a shortcut for ${name}` });
};

describe("SettingsKeyboard", () => {
  it("lists commands by group with their effective bindings (AC-17/AC-18)", async () => {
    setup();
    expect(await screen.findByText("Navigation")).toBeInTheDocument();
    const palette = await row("Open command palette");
    expect(within(palette).getByText("K")).toBeInTheDocument();
    expect(within(await row("Toggle dark / light theme")).getByText("Not set")).toBeInTheDocument();
  });

  it("hides desktop-only commands in a browser (AC-9)", async () => {
    setup();
    await screen.findByText("Open command palette");
    expect(screen.queryByText("Show / hide the DevDigest window")).not.toBeInTheDocument();
  });

  it("filters by name (AC-19)", async () => {
    setup();
    fireEvent.change(await screen.findByRole("textbox", { name: "Search shortcuts…" }), { target: { value: "skills" } });
    expect(screen.getByText("Go to Skills")).toBeInTheDocument();
    expect(screen.queryByText("Open command palette")).not.toBeInTheDocument();
  });

  it("filters by a pressed key combination (AC-20)", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Search by keys" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search by keys" }), { key: "j", code: "KeyJ" });
    expect(screen.getByText("Next finding")).toBeInTheDocument();
    expect(screen.queryByText("Open command palette")).not.toBeInTheDocument();
  });

  it("records a new combination and saves only the override (AC-21/AC-24/AC-13)", async () => {
    const { saved } = setup();
    const recorder = await change("Go to Skills");
    fireEvent.keyDown(recorder, { key: "S", code: "KeyS", ctrlKey: true, shiftKey: true });
    await waitFor(() =>
      expect(saved()).toEqual({ version: 1, singleKey: true, overrides: { "nav.skills": "Mod+Shift+KeyS" } }),
    );
    expect(within(await row("Go to Skills")).getByText("Modified")).toBeInTheDocument();
  });

  it("Esc cancels and Backspace disables (AC-22/AC-23)", async () => {
    const { api, saved } = setup();
    fireEvent.keyDown(await change("Go to Skills"), { key: "Escape", code: "Escape" });
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
    fireEvent.keyDown(await change("Go to Skills"), { key: "Backspace", code: "Backspace" });
    await waitFor(() => expect(saved()).toMatchObject({ overrides: { "nav.skills": null } }));
    expect(within(await row("Go to Skills")).getByText("Not set")).toBeInTheDocument();
  });

  it("records a two-key sequence for sequence commands (AC-27)", async () => {
    const { saved } = setup();
    const recorder = await change("Go to Skills");
    fireEvent.keyDown(recorder, { key: "m", code: "KeyM" });
    fireEvent.keyDown(recorder, { key: "k", code: "KeyK" });
    await waitFor(() => expect(saved()).toMatchObject({ overrides: { "nav.skills": "KeyM KeyK" } }));
  });

  it("refuses reserved combinations with a reason (AC-30)", async () => {
    const { api } = setup();
    fireEvent.keyDown(await change("Go to Skills"), { key: "c", code: "KeyC", ctrlKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("reserved");
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("warns about a conflict and replaces in one update (AC-32/AC-33)", async () => {
    const { api, saved } = setup();
    fireEvent.keyDown(await change("Toggle dark / light theme"), { key: "k", code: "KeyK", ctrlKey: true });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Already used by “Open command palette”");
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
    fireEvent.click(within(alert).getByRole("button", { name: "Replace" }));
    await waitFor(() =>
      expect(saved()).toMatchObject({ overrides: { "theme.toggle": "Mod+KeyK", "palette.open": null } }),
    );
    expect(api.calls.filter((c) => c.method === "PUT")).toHaveLength(1);
  });

  it("resets one row and all rows (AC-25/AC-26)", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { saved } = setup({
      keybindings: { version: 1, singleKey: true, overrides: { "nav.skills": null, "nav.agents": "Mod+Shift+KeyA" } },
    });
    // Wait for the stored overrides to load before looking for Reset.
    fireEvent.click(await within(await row("Go to Skills")).findByRole("button", { name: "Reset Go to Skills to its default" }));
    await waitFor(() => expect(saved()).toMatchObject({ overrides: { "nav.agents": "Mod+Shift+KeyA" } }));
    fireEvent.click(screen.getByRole("button", { name: "Reset all to defaults" }));
    await waitFor(() => expect(saved()).toMatchObject({ overrides: {} }));
  });

  it("switches single-key shortcuts off (AC-34)", async () => {
    const { saved } = setup();
    const sw = await screen.findByRole("switch", { name: /Single-key shortcuts/ });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    await waitFor(() => expect(saved()).toMatchObject({ singleKey: false }));
  });
});

describe("SettingsKeyboard in the desktop app", () => {
  it("shows the global Show/Hide command and keeps a combination the OS refused unsaved (AC-44/AC-45)", async () => {
    const { bridge } = installFakeBridge("win32");
    const { api } = setup();
    const name = "Show / hide the DevDigest window";
    expect(within(await row(name)).getByText("Global · desktop app")).toBeInTheDocument();
    await waitFor(() => expect(bridge.app.setKeybindings).toHaveBeenCalled());
    vi.mocked(bridge.app.setKeybindings).mockResolvedValueOnce({ global: { "window.toggle": "taken" } });
    fireEvent.keyDown(await change(name), { key: "D", code: "KeyD", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Taken by another app");
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("requires a modifier for global shortcuts (AC-31)", async () => {
    installFakeBridge("win32");
    setup();
    fireEvent.keyDown(await change("Show / hide the DevDigest window"), { key: "d", code: "KeyD", shiftKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent("Needs Ctrl/⌘ or Alt");
  });
});
