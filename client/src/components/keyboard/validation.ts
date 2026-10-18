/* Binding validation (SPEC-11 AC-30 – AC-33): reserved combos, scope rules, conflicts. */
import { bindingChords, isModified } from "./keys";
import type { Binding, CommandDef, Platform } from "./types";

/** Combinations the OS, the browser or text editing rely on — never rebindable onto. */
export const RESERVED: ReadonlySet<string> = new Set([
  "Mod+KeyC",
  "Mod+KeyV",
  "Mod+KeyX",
  "Mod+KeyZ",
  "Mod+Shift+KeyZ",
  "Mod+KeyY",
  "Mod+KeyA",
  "Mod+KeyW",
  "Mod+KeyQ",
  "Mod+KeyR",
  "Mod+Shift+KeyR",
  "Alt+F4",
  "F5",
  "F11",
  "F12",
  "Tab",
  "Shift+Tab",
  "Escape",
  "Enter",
]);

export type BindingError =
  | "reserved"
  | "needsModifier"
  | "noSequenceHere"
  | "sequenceNeedsPlainKeys"
  | "altGr";

/** Why `binding` can't be used for `cmd`, or null when it's fine. */
export function validateBinding(cmd: CommandDef, binding: Binding, platform: Platform): BindingError | null {
  const chords = bindingChords(binding);
  if (chords.some((c) => RESERVED.has(c))) return "reserved";
  // Windows reports AltGr as Ctrl+Alt: a combo with both breaks typing ґ, ł, € …
  if (platform !== "mac" && chords.some((c) => c.split("+").includes("Mod") && c.split("+").includes("Alt")))
    return "altGr";
  if (chords.length > 1) {
    // Native accelerators and global shortcuts are single chords.
    if (cmd.owner !== "studio") return "noSequenceHere";
    if (chords.some(isModified)) return "sequenceNeedsPlainKeys";
  }
  // Menu accelerators and global shortcuts fire even while typing — never on a plain key.
  if (cmd.owner !== "studio" && !isModified(chords[0]!)) return "needsModifier";
  return null;
}

/**
 * The other command that `binding` would clash with: same binding, or one is
 * a prefix of the other (a single `G` would swallow every `G then …`).
 * All scopes can be active together (a global shortcut also fires while the
 * window is focused), so any visible command can conflict.
 */
export function findConflict(
  id: string,
  binding: Binding,
  effective: ReadonlyMap<string, Binding | null>,
): string | null {
  for (const [otherId, other] of effective) {
    if (otherId === id || !other) continue;
    if (other === binding || other.startsWith(`${binding} `) || binding.startsWith(`${other} `)) return otherId;
  }
  return null;
}
