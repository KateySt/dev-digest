
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { get, mockFetch, put, renderApp } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { KeyboardProvider } from "@/components/keyboard";
import { SettingsDesktop } from "./SettingsDesktop";

afterEach(() => {
  cleanup();
  removeFakeBridge();
});

function setup(settings: Record<string, unknown> = {}) {
  mockFetch([get("/settings", () => settings), put("/settings", (c) => ({ ...settings, ...(c.body as object) }))]);
  renderApp(
    <KeyboardProvider>
      <SettingsDesktop />
    </KeyboardProvider>,
  );
}

describe("SettingsDesktop (SPEC-11 AC-40)", () => {
  it("Windows: the tray toggle reads and saves the main-process pref", async () => {
    const { bridge } = installFakeBridge("win32");
    setup();
    const tray = await screen.findByRole("switch", { name: /Keep running in the tray/ });
    expect(tray).toHaveAttribute("aria-checked", "true");
    fireEvent.click(tray);
    await waitFor(() => expect(tray).toHaveAttribute("aria-checked", "false"));
    expect(bridge.app.setPrefs).toHaveBeenCalledWith({ closeToTray: false });
  });

  it("macOS: no tray toggle", async () => {
    installFakeBridge("darwin");
    setup();
    await screen.findByText("Show / hide from anywhere");
    expect(screen.queryByRole("switch", { name: /Keep running in the tray/ })).not.toBeInTheDocument();
  });

  it("shows the global shortcut (or Not set) and links to its Keyboard row", async () => {
    installFakeBridge("win32");
    setup({ keybindings: { version: 1, singleKey: true, overrides: { "window.toggle": "Mod+Shift+KeyD" } } });
    expect(await screen.findByText("D")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Change in Keyboard settings" })).toHaveAttribute(
      "href",
      "/settings/keyboard#kb-window-toggle",
    );
    cleanup();
    removeFakeBridge();
    installFakeBridge("win32");
    setup();
    expect(await screen.findByText("Not set")).toBeInTheDocument();
  });
});
