/* Settings → Notifications: two prefs stored via PUT /settings, both default on. */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../messages/en/settings.json";
import { get, mockFetch, put } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { SettingsNotifications } from "./SettingsNotifications";

afterEach(() => {
  cleanup();
  removeFakeBridge();
});

function renderPanel(settings: Record<string, unknown>) {
  const api = mockFetch([
    get("/settings", () => settings),
    put("/settings", (call) => ({ ...settings, ...(call.body as object) })),
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
        <SettingsNotifications />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return api;
}

describe("SettingsNotifications", () => {
  it("both prefs default to on; turning one off saves it", async () => {
    installFakeBridge();
    const api = renderPanel({});
    const desktop = await screen.findByRole("switch", { name: /System notifications/ });
    await waitFor(() => expect(desktop).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByRole("switch", { name: /Sound/ })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("switch", { name: /Sound/ }));
    await waitFor(() => expect(api.callsTo("PUT", "/settings")[0]?.body).toEqual({ notification_sound: false }));
    expect(screen.queryByText(/available in the DevDigest desktop app/)).toBeNull();
  });

  it("reflects a stored 'off' and greys out Sound while system notifications are off", async () => {
    renderPanel({ desktop_notifications: false });
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /System notifications/ })).toHaveAttribute("aria-checked", "false"),
    );
    expect(screen.getByRole("switch", { name: /Sound/ })).toBeDisabled();
    expect(screen.getByText(/available in the DevDigest desktop app/)).toBeInTheDocument(); // browser: no bridge
  });

  it("desktop on Windows: the tray toggle reads and saves the main-process pref", async () => {
    const { bridge } = installFakeBridge("win32");
    renderPanel({});
    const tray = await screen.findByRole("switch", { name: /Keep running in the tray/ });
    expect(tray).toHaveAttribute("aria-checked", "true");
    fireEvent.click(tray);
    await waitFor(() => expect(tray).toHaveAttribute("aria-checked", "false"));
    expect(bridge.app.setPrefs).toHaveBeenCalledWith({ closeToTray: false });
  });

  it("hides the tray toggle on macOS and in a browser", async () => {
    installFakeBridge("darwin");
    renderPanel({});
    await screen.findByRole("switch", { name: /System notifications/ });
    expect(screen.queryByRole("switch", { name: /Keep running in the tray/ })).not.toBeInTheDocument();
    cleanup();
    removeFakeBridge();
    renderPanel({});
    await screen.findByRole("switch", { name: /System notifications/ });
    expect(screen.queryByRole("switch", { name: /Keep running in the tray/ })).not.toBeInTheDocument();
  });
});
