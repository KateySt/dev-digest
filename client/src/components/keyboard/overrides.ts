/* Stored overrides (SPEC-11 AC-13 – AC-16): parse defensively, resolve effective bindings. */
import { parseBinding } from "./keys";
import { commandById } from "./registry";
import { validateBinding } from "./validation";
import type { Binding, CommandDef, Overrides, Platform, StoredKeybindings } from "./types";

/** Non-secret settings key (PUT /settings passthrough extra). */
export const KEYBINDINGS_SETTING = "keybindings";
/** Anything bigger is ignored outright — no legitimate value gets near it. */
export const MAX_STORED_BYTES = 16 * 1024;

export const EMPTY_KEYBINDINGS: StoredKeybindings = { version: 1, singleKey: true, overrides: {} };

let warnedTooBig = false;

/**
 * The stored value is user data saved unvalidated by the server, possibly by
 * an older build: keep only entries for known, rebindable commands whose
 * binding is well-formed and valid for that command (AC-14).
 */
export function parseStoredKeybindings(raw: unknown, platform: Platform): StoredKeybindings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_KEYBINDINGS;
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return EMPTY_KEYBINDINGS;
  }
  if (size > MAX_STORED_BYTES) {
    if (!warnedTooBig) console.warn(`[keyboard] ignoring stored keybindings: ${size} bytes`);
    warnedTooBig = true;
    return EMPTY_KEYBINDINGS;
  }
  const v = raw as Record<string, unknown>;
  const source =
    v.overrides && typeof v.overrides === "object" && !Array.isArray(v.overrides)
      ? (v.overrides as Record<string, unknown>)
      : {};
  const overrides: Overrides = {};
  for (const [id, value] of Object.entries(source)) {
    const cmd = commandById(id);
    if (!cmd || !cmd.rebindable) continue;
    if (value === null) {
      overrides[id] = null;
      continue;
    }
    const binding = parseBinding(value);
    if (binding && !validateBinding(cmd, binding, platform)) overrides[id] = binding;
  }
  return { version: 1, singleKey: v.singleKey !== false, overrides };
}

/** Override when present (including null = disabled), else the platform default (AC-15). */
export function effectiveBinding(cmd: CommandDef, overrides: Overrides, platform: Platform): Binding | null {
  return Object.prototype.hasOwnProperty.call(overrides, cmd.id) ? overrides[cmd.id]! : cmd.defaults[platform];
}

export function effectiveBindings(
  commands: CommandDef[],
  overrides: Overrides,
  platform: Platform,
): Map<string, Binding | null> {
  return new Map(commands.map((c) => [c.id, effectiveBinding(c, overrides, platform)]));
}

/** Apply a patch: a binding/null sets an override, `undefined` deletes it (reset). */
export function patchOverrides(current: Overrides, patch: Record<string, Binding | null | undefined>): Overrides {
  const next: Overrides = { ...current };
  for (const [id, value] of Object.entries(patch)) {
    if (value === undefined) delete next[id];
    else next[id] = value;
  }
  return next;
}
