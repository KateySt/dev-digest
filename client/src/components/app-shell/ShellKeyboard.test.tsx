
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { get, mockFetch, put, renderApp } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ToastProvider } from "@/lib/contexts/toast";
import { KeyboardProvider, useKeyboard, type KeyboardContextValue } from "@/components/keyboard";
import { ShellKeyboard } from "./ShellKeyboard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), forward: vi.fn() }) }));
vi.mock("@/lib/contexts/repoContext", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));

afterEach(() => {
  cleanup();
  removeFakeBridge();
  push.mockReset();
});

let kb: KeyboardContextValue;
function Capture() {
  kb = useKeyboard();
  return null;
}

function setup() {
  const api = mockFetch([get("/settings", () => ({})), put("/settings", (c) => c.body as object)]);
  const palette = vi.fn();
  renderApp(
    <ToastProvider>
      <KeyboardProvider>
        <SidebarProvider>
          <ShellKeyboard onOpenPalette={palette} onOpenHelp={vi.fn()} />
          <Capture />
        </SidebarProvider>
      </KeyboardProvider>
    </ToastProvider>,
  );
  return { api, palette };
}

describe("ShellKeyboard", () => {
  it("navigates with g-commands and Mod+N by sidebar position", () => {
    setup();
    act(() => void kb.run("nav.skills"));
    act(() => void kb.run("desktop.section.1"));
    expect(push).toHaveBeenNthCalledWith(1, "/skills");
    expect(push).toHaveBeenNthCalledWith(2, "/repos/r1/pulls");
  });

  it("toggles the notification sound through settings and confirms it (AC-36/AC-38)", async () => {
    const { api } = setup();
    await waitFor(() => expect(api.calls.some((c) => c.path === "/settings")).toBe(true));
    act(() => void kb.run("sound.toggle"));
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === "PUT")?.body).toEqual({ notification_sound: false }),
    );
    expect(await screen.findByText("Notification sound: off")).toBeInTheDocument();
  });

  it("desktop: toggles close-to-tray (AC-37)", async () => {
    const { bridge } = installFakeBridge("win32");
    setup();
    act(() => void kb.run("desktop.trayToggle"));
    await waitFor(() => expect(bridge.app.setPrefs).toHaveBeenCalledWith({ closeToTray: false }));
    expect(await screen.findByText("Keep running in the tray: off")).toBeInTheDocument();
  });
});
