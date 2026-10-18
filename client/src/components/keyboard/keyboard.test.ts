/* Keyboard registry core: physical-key chords, binding format, validation, stored overrides. */
import { describe, it, expect } from "vitest";
import { bindingText, chordFromEvent, chordsForEvent, formatBinding, isSingleKey, parseBinding } from "./keys";
import { COMMANDS, commandById, visibleCommands } from "./registry";
import { findConflict, validateBinding } from "./validation";
import { effectiveBinding, effectiveBindings, parseStoredKeybindings, patchOverrides } from "./overrides";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);
const cmd = (id: string) => commandById(id)!;

describe("chords from events (AC-10/AC-11)", () => {
  it("uses the physical key, so a Cyrillic layout matches like a Latin one", () => {
    expect(chordFromEvent(key({ key: "g", code: "KeyG" }), "other")).toBe("KeyG");
    expect(chordFromEvent(key({ key: "п", code: "KeyG" }), "other")).toBe("KeyG");
    expect(chordFromEvent(key({ key: "л", code: "KeyK", ctrlKey: true }), "other")).toBe("Mod+KeyK");
  });

  it("maps ⌘ to Mod on macOS and keeps Ctrl separate there", () => {
    expect(chordFromEvent(key({ code: "KeyK", metaKey: true }), "mac")).toBe("Mod+KeyK");
    expect(chordFromEvent(key({ code: "KeyK", ctrlKey: true }), "mac")).toBe("Ctrl+KeyK");
  });

  it("ignores bare modifiers and the Windows key", () => {
    expect(chordFromEvent(key({ code: "ShiftLeft", shiftKey: true }), "other")).toBeNull();
    expect(chordFromEvent(key({ code: "KeyK", metaKey: true }), "other")).toBeNull();
  });

  it("matches ? by character on any layout and by Shift+Slash", () => {
    expect(chordsForEvent(key({ key: "?", code: "Digit7", shiftKey: true }), "other")).toContain("Shift+Slash");
    expect(chordsForEvent(key({ key: "?", code: "Slash", shiftKey: true }), "other")).toEqual(["Shift+Slash"]);
  });
});

describe("binding format", () => {
  it("normalizes modifier order and rejects junk", () => {
    expect(parseBinding("Shift+Mod+KeyD")).toBe("Mod+Shift+KeyD");
    expect(parseBinding("KeyG  KeyP")).toBe("KeyG KeyP");
    expect(parseBinding("Mod+Mod+KeyD")).toBeNull();
    expect(parseBinding("Hyper+KeyD")).toBeNull();
    expect(parseBinding("KeyG KeyP KeyQ")).toBeNull();
    expect(parseBinding("<script>")).toBeNull();
    expect(parseBinding(42)).toBeNull();
  });

  it("shows US labels with platform modifiers (AC-12)", () => {
    expect(formatBinding("Mod+KeyK", "mac")).toEqual([["⌘", "K"]]);
    expect(formatBinding("Mod+Shift+KeyD", "other")).toEqual([["Ctrl", "Shift", "D"]]);
    expect(formatBinding("Shift+Slash", "other")).toEqual([["?"]]);
    expect(bindingText("KeyG KeyP", "other")).toBe("G then P");
  });

  it("knows single-key bindings", () => {
    expect(isSingleKey("KeyG KeyP")).toBe(true);
    expect(isSingleKey("Shift+Slash")).toBe(true);
    expect(isSingleKey("Mod+KeyK")).toBe(false);
  });
});

describe("registry (AC-1/AC-2/AC-9)", () => {
  it("keeps today's defaults", () => {
    expect(cmd("palette.open").defaults.other).toBe("Mod+KeyK");
    expect(cmd("help.show").defaults.other).toBe("Shift+Slash");
    expect(cmd("nav.pulls").defaults.other).toBe("KeyG KeyP");
    expect(cmd("nav.settings").defaults.other).toBe("KeyG Comma");
    expect(cmd("findings.next").defaults.other).toBe("KeyJ");
    expect(cmd("sidebar.toggle").defaults.other).toBe("Mod+KeyB");
    expect(cmd("theme.toggle").defaults.other).toBeNull();
  });

  it("has unique ids and hides desktop-only commands in a browser", () => {
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
    expect(visibleCommands(false).some((c) => c.desktopOnly)).toBe(false);
    expect(visibleCommands(true).some((c) => c.id === "window.toggle")).toBe(true);
  });

  it("has no conflicting defaults", () => {
    for (const platform of ["mac", "other"] as const) {
      const eff = effectiveBindings(COMMANDS, {}, platform);
      for (const [id, b] of eff) if (b) expect(findConflict(id, b, eff)).toBeNull();
    }
  });
});

describe("validation (AC-30 – AC-32)", () => {
  it("refuses reserved combos", () => {
    expect(validateBinding(cmd("palette.open"), "Mod+KeyC", "other")).toBe("reserved");
    expect(validateBinding(cmd("palette.open"), "F5", "other")).toBe("reserved");
  });

  it("requires a non-Shift modifier and a single chord for global shortcuts", () => {
    expect(validateBinding(cmd("window.toggle"), "Shift+KeyD", "other")).toBe("needsModifier");
    expect(validateBinding(cmd("window.toggle"), "KeyG KeyD", "other")).toBe("noSequenceHere");
    expect(validateBinding(cmd("window.toggle"), "Mod+Shift+KeyD", "other")).toBeNull();
    expect(validateBinding(cmd("desktop.settings"), "KeyS", "other")).toBe("needsModifier");
  });

  it("refuses AltGr-like Ctrl+Alt on Windows/Linux only", () => {
    expect(validateBinding(cmd("palette.open"), "Mod+Alt+KeyK", "other")).toBe("altGr");
    expect(validateBinding(cmd("palette.open"), "Mod+Alt+KeyK", "mac")).toBeNull();
  });

  it("finds equal and prefix conflicts", () => {
    const eff = effectiveBindings(COMMANDS, {}, "other");
    expect(findConflict("theme.toggle", "Mod+KeyK", eff)).toBe("palette.open");
    expect(findConflict("theme.toggle", "KeyG", eff)).toMatch(/^nav\./);
    expect(findConflict("theme.toggle", "Mod+Shift+KeyT", eff)).toBeNull();
  });
});

describe("stored overrides (AC-13 – AC-16)", () => {
  it("drops unknown ids, non-rebindable commands and invalid bindings, keeps the rest", () => {
    const stored = parseStoredKeybindings(
      {
        version: 1,
        singleKey: false,
        overrides: {
          "nav.skills": "Mod+Shift+KeyS",
          "nope.command": "Mod+KeyN",
          "palette.open": "Mod+KeyC",
          "findings.next": null,
          "theme.toggle": "garbage",
        },
      },
      "other",
    );
    expect(stored).toEqual({
      version: 1,
      singleKey: false,
      overrides: { "nav.skills": "Mod+Shift+KeyS", "findings.next": null },
    });
  });

  it("treats junk and oversized values as no overrides", () => {
    expect(parseStoredKeybindings("x", "other").overrides).toEqual({});
    expect(parseStoredKeybindings([1], "other").overrides).toEqual({});
    const huge = { overrides: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`x${i}`, "Mod+KeyK"])) };
    expect(parseStoredKeybindings(huge, "other").overrides).toEqual({});
  });

  it("falls back to the default only without an override, so new defaults reach others", () => {
    expect(effectiveBinding(cmd("nav.skills"), {}, "other")).toBe("KeyG KeyS");
    expect(effectiveBinding(cmd("nav.skills"), { "nav.skills": null }, "other")).toBeNull();
    expect(effectiveBinding(cmd("desktop.back"), {}, "mac")).toBe("Mod+BracketLeft");
  });

  it("patches: a value sets, undefined resets", () => {
    expect(patchOverrides({ a: "KeyA" }, { a: undefined, b: null })).toEqual({ b: null });
  });
});
