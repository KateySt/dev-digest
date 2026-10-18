/* Physical-key helpers: event → chord, chord → display labels, parsing. */
import type { Binding, Platform } from "./types";

export const MODIFIERS = ["Mod", "Ctrl", "Alt", "Shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

const NAMED: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "Space",
  Enter: "Enter",
  Escape: "Esc",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

/** US-layout label of a physical key code, or null when we don't support it. */
export function keyLabel(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1]!;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED[code] ?? null;
}

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const p =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  return /mac/i.test(p) ? "mac" : "other";
}

/**
 * The chord a keydown event represents, or null for a bare modifier, an
 * unsupported key, or the Windows/Super key on non-macOS platforms.
 */
export function chordFromEvent(e: KeyboardEvent, platform: Platform): string | null {
  if (!keyLabel(e.code)) return null;
  if (platform !== "mac" && e.metaKey) return null;
  const mods: Modifier[] = [];
  if (platform === "mac" ? e.metaKey : e.ctrlKey) mods.push("Mod");
  if (platform === "mac" && e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, e.code].join("+");
}

/** Chords to try for an event. `?` is a character placed differently per
 *  layout, so a produced "?" also matches the US position `Shift+Slash`. */
export function chordsForEvent(e: KeyboardEvent, platform: Platform): string[] {
  const chord = chordFromEvent(e, platform);
  const out = chord ? [chord] : [];
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !out.includes("Shift+Slash")) out.push("Shift+Slash");
  return out;
}

export function chordModifiers(chord: string): string[] {
  return chord.split("+").slice(0, -1);
}

/** Has a modifier other than Shift (Mod/Ctrl/Alt) — safe while typing. */
export function isModified(chord: string): boolean {
  return chordModifiers(chord).some((m) => m !== "Shift");
}

export function bindingChords(b: Binding): string[] {
  return b.split(" ");
}

/** True when every chord of the binding is unmodified — a "single-key" shortcut (WCAG 2.1.4). */
export function isSingleKey(b: Binding): boolean {
  return bindingChords(b).every((c) => !isModified(c));
}

/** Normalize a binding string, or null if it isn't well-formed. */
export function parseBinding(raw: unknown): Binding | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const chords = raw.trim().split(/\s+/);
  if (chords.length < 1 || chords.length > 2) return null;
  const out: string[] = [];
  for (const chord of chords) {
    const parts = chord.split("+");
    const code = parts.pop()!;
    if (!keyLabel(code)) return null;
    const seen = new Set<string>();
    for (const m of parts) {
      if (!(MODIFIERS as readonly string[]).includes(m) || seen.has(m)) return null;
      seen.add(m);
    }
    out.push([...MODIFIERS.filter((m) => seen.has(m)), code].join("+"));
  }
  return out.join(" ");
}

const MAC_SYMBOL: Record<Modifier, string> = { Mod: "⌘", Ctrl: "⌃", Alt: "⌥", Shift: "⇧" };
const OTHER_LABEL: Record<Modifier, string> = { Mod: "Ctrl", Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift" };

/** Display parts of one chord, e.g. ["⌘", "K"] or ["Ctrl", "Shift", "D"]. */
export function formatChord(chord: string, platform: Platform): string[] {
  if (chord === "Shift+Slash") return ["?"];
  const parts = chord.split("+");
  const code = parts.pop()!;
  const mods = parts.map((m) => (platform === "mac" ? MAC_SYMBOL : OTHER_LABEL)[m as Modifier] ?? m);
  return [...mods, keyLabel(code) ?? code];
}

/** Display parts of a binding: one array per chord. */
export function formatBinding(b: Binding, platform: Platform): string[][] {
  return bindingChords(b).map((c) => formatChord(c, platform));
}

/** One-line text form, e.g. "⌘K", "Ctrl+Shift+D", "G then P". */
export function bindingText(b: Binding, platform: Platform, thenWord = "then"): string {
  return formatBinding(b, platform)
    .map((parts) => (platform === "mac" ? parts.join("") : parts.join("+")))
    .join(` ${thenWord} `);
}
