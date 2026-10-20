/* KeyboardProvider — the dispatcher: physical keys, sequences, text-input guard,
   scope via registered handlers, stored overrides, single-key switch, desktop sync. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { get, mockFetch, put, renderApp } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { KeyboardProvider, useCommand, useKeyboard, type KeyboardContextValue } from "./KeyboardProvider";

afterEach(() => {
  cleanup();
  removeFakeBridge();
  vi.useRealTimers();
});

const calls: string[] = [];

function Handlers({ findings = false }: { findings?: boolean }) {
  useCommand("palette.open", () => calls.push("palette"));
  useCommand("help.show", () => calls.push("help"));
  useCommand("nav.pulls", () => calls.push("pulls"));
  useCommand("findings.next", () => calls.push("next"), findings);
  return <input aria-label="field" />;
}

let ctx: KeyboardContextValue;
function Capture() {
  ctx = useKeyboard();
  return null;
}

function setup(settings: Record<string, unknown> = {}, findings = false) {
  calls.length = 0;
  const api = mockFetch([
    get("/settings", () => settings),
    put("/settings", (c) => ({ ...settings, ...(c.body as object) })),
  ]);
  const utils = renderApp(
    <KeyboardProvider>
      <Handlers findings={findings} />
      <Capture />
    </KeyboardProvider>,
  );
  return { api, ...utils };
}

const press = (init: KeyboardEventInit, target: Element | Window = window) =>
  fireEvent.keyDown(target, { bubbles: true, ...init });

describe("KeyboardProvider dispatch", () => {
  it("runs Mod+K and the ? help on any layout (AC-3, AC-10, AC-11)", async () => {
    setup();
    await waitFor(() => expect(ctx.effective.size).toBeGreaterThan(0));
    press({ key: "л", code: "KeyK", ctrlKey: true });
    press({ key: "?", code: "Digit7", shiftKey: true }); // "?" on a Ukrainian layout
    expect(calls).toEqual(["palette", "help"]);
  });

  it("runs a g-then-key sequence typed on a Cyrillic layout", () => {
    setup();
    press({ key: "п", code: "KeyG" });
    press({ key: "з", code: "KeyP" });
    expect(calls).toEqual(["pulls"]);
  });

  it("ignores single keys while typing but keeps modified ones (AC-4)", () => {
    setup();
    const field = screen.getByRole("textbox", { name: "field" });
    press({ key: "g", code: "KeyG" }, field);
    press({ key: "p", code: "KeyP" }, field);
    press({ key: "k", code: "KeyK", ctrlKey: true }, field);
    expect(calls).toEqual(["palette"]);
  });

  it("ignores IME composition (AC-5)", () => {
    setup();
    press({ key: "k", code: "KeyK", ctrlKey: true, isComposing: true });
    expect(calls).toEqual([]);
  });

  it("runs page commands only while their page registered a handler (AC-6)", () => {
    setup({}, false);
    press({ key: "j", code: "KeyJ" });
    expect(calls).toEqual([]);
    cleanup();
    setup({}, true);
    press({ key: "j", code: "KeyJ" });
    expect(calls).toEqual(["next"]);
  });

  it("uses a stored override instead of the default (AC-15)", async () => {
    setup({ keybindings: { version: 1, singleKey: true, overrides: { "palette.open": "Mod+Shift+KeyP" } } });
    await waitFor(() => expect(ctx.effective.get("palette.open")).toBe("Mod+Shift+KeyP"));
    press({ key: "k", code: "KeyK", ctrlKey: true });
    press({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true });
    expect(calls).toEqual(["palette"]);
  });

  it("switching single-key shortcuts off disables sequences and plain keys only (AC-35)", async () => {
    setup({ keybindings: { version: 1, singleKey: false, overrides: {} } }, true);
    await waitFor(() => expect(ctx.singleKey).toBe(false));
    press({ key: "j", code: "KeyJ" });
    press({ key: "g", code: "KeyG" });
    press({ key: "p", code: "KeyP" });
    press({ key: "k", code: "KeyK", ctrlKey: true });
    expect(calls).toEqual(["palette"]);
  });

  it("saves only overrides and applies them at once (AC-13, AC-29)", async () => {
    const { api } = setup();
    await waitFor(() => expect(ctx.effective.size).toBeGreaterThan(0));
    // Let the initial GET /settings land first — a late response would
    // overwrite the optimistic save below.
    await waitFor(() => expect(api.calls.some((c) => c.method === "GET")).toBe(true));
    await act(async () => {});
    await act(async () => {
      await ctx.setBindings({ "nav.pulls": "Mod+Shift+Digit1" });
    });
    expect(ctx.effective.get("nav.pulls")).toBe("Mod+Shift+Digit1");
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === "PUT")?.body).toEqual({
        keybindings: { version: 1, singleKey: true, overrides: { "nav.pulls": "Mod+Shift+Digit1" } },
      }),
    );
    press({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true });
    expect(calls).toEqual(["pulls"]);
  });
});

describe("KeyboardProvider in the desktop app", () => {
  it("pushes menu, global and display bindings to main and runs menu commands (AC-42)", async () => {
    const { bridge, emitCommand } = installFakeBridge("win32");
    setup();
    await waitFor(() => expect(bridge.app.setKeybindings).toHaveBeenCalled());
    const payload = vi.mocked(bridge.app.setKeybindings).mock.calls.at(-1)![0];
    expect(payload.menu["desktop.settings"]).toBe("Mod+Comma");
    expect(payload.menu["desktop.section.1"]).toBe("Mod+Digit1");
    expect(payload.global["window.toggle"]).toBeNull();
    expect(payload.display["palette.open"]).toBe("Mod+KeyK");
    act(() => emitCommand("palette.open"));
    act(() => emitCommand("not.a.command"));
    expect(calls).toEqual(["palette"]);
  });

  it("does not save a global shortcut the OS refused (AC-45)", async () => {
    const { bridge } = installFakeBridge("win32");
    const { api } = setup();
    await waitFor(() => expect(bridge.app.setKeybindings).toHaveBeenCalled());
    vi.mocked(bridge.app.setKeybindings).mockResolvedValueOnce({ global: { "window.toggle": "taken" } });
    let result: Awaited<ReturnType<KeyboardContextValue["setBindings"]>> | undefined;
    await act(async () => {
      result = await ctx.setBindings({ "window.toggle": "Mod+Shift+KeyD" });
    });
    expect(result).toEqual({ ok: false, reason: "taken" });
    expect(api.calls.some((c) => c.method === "PUT")).toBe(false);
    expect(ctx.effective.get("window.toggle")).toBeNull();
  });
});
