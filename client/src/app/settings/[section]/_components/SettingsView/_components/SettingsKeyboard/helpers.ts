/* Pure helpers for Settings → Keyboard. */
import type { Binding } from "@/components/keyboard";

/** DOM id of a command's row, for deep links like /settings/keyboard#kb-window-toggle. */
export function rowAnchor(commandId: string): string {
  return `kb-${commandId.replace(/\./g, "-")}`;
}

/** "Search by keys": a binding matches when any of its chords is the pressed chord. */
export function bindingHasChord(binding: Binding | null, chord: string): boolean {
  return !!binding && binding.split(" ").includes(chord);
}
