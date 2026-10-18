import { globalShortcut } from 'electron';
import log from 'electron-log/main';
import { getPrefs, updatePrefs } from './prefs';

/**
 * Keyboard bindings the main process applies (SPEC-11 D-4 – D-9). The studio
 * owns the command registry and sends, over `app:set-keybindings`:
 *   menu    — native menu accelerators (main receives the key, sends the id back)
 *   global  — OS-wide shortcuts via `globalShortcut`
 *   display — studio-owned keys the menu only shows (registerAccelerator: false)
 *   labels  — menu item labels for those ids (plain text, length-capped)
 * Bindings use the studio's format: modifiers Mod/Ctrl/Alt/Shift + a
 * `KeyboardEvent.code`, e.g. `Mod+Shift+KeyD`. Everything arriving here is
 * untrusted (renderer, or a cached prefs file): ids come from a closed list
 * and every binding is re-validated before it reaches Electron.
 *
 * Command ids are duplicated from client/src/components/keyboard/registry.ts
 * on purpose (same reasoning as E5) — keep both in sync.
 */
export const MENU_COMMANDS = [
  'desktop.settings',
  ...Array.from({ length: 9 }, (_, i) => `desktop.section.${i + 1}`),
  'desktop.back',
  'desktop.forward',
] as const;
export const GLOBAL_COMMANDS = ['window.toggle'] as const;
export const DISPLAY_COMMANDS = ['palette.open', 'help.show'] as const;

export type Bindings = {
  menu: Record<string, string | null>;
  global: Record<string, string | null>;
  display: Record<string, string | null>;
  labels: Record<string, string>;
};
export type GlobalStatus = 'ok' | 'taken' | 'invalid';

const isMac = process.platform === 'darwin';

/** First-run defaults (before the studio has ever sent its set) — mirror the registry's. */
const SIDEBAR_LABELS = [
  'Pull Requests', 'Onboarding Tour', 'Project Context', 'Skills', 'Agents',
  'Conventions', 'Eval Dashboard', 'Memory', 'Multi-Agent Review',
];
export const DEFAULT_BINDINGS: Bindings = {
  menu: {
    'desktop.settings': 'Mod+Comma',
    ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`desktop.section.${i + 1}`, `Mod+Digit${i + 1}`])),
    'desktop.back': isMac ? 'Mod+BracketLeft' : 'Alt+ArrowLeft',
    'desktop.forward': isMac ? 'Mod+BracketRight' : 'Alt+ArrowRight',
  },
  global: { 'window.toggle': null },
  display: { 'palette.open': 'Mod+KeyK', 'help.show': 'Shift+Slash' },
  labels: Object.fromEntries(SIDEBAR_LABELS.map((l, i) => [`desktop.section.${i + 1}`, `Go to ${l}`])),
};

const MODIFIERS: Record<string, string> = { Mod: 'CommandOrControl', Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift' };
const NAMED_KEYS: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=',
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
  Space: 'Space', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Delete: 'Delete',
};

function keyFor(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1]!;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

/**
 * Electron accelerator for one binding, or null if it isn't acceptable (D-5):
 * one chord, ≤ 4 parts, known modifiers without repeats, a known key, and —
 * unless it's display-only — a modifier other than Shift.
 */
export function toAccelerator(binding: unknown, displayOnly = false): string | null {
  if (typeof binding !== 'string' || binding.length > 64 || binding.includes(' ')) return null;
  const parts = binding.split('+');
  if (parts.length > 4) return null;
  const key = keyFor(parts.pop()!);
  if (!key) return null;
  const mods: string[] = [];
  for (const m of parts) {
    const mapped = MODIFIERS[m];
    if (!mapped || mods.includes(mapped)) return null;
    mods.push(mapped);
  }
  if (!displayOnly && !mods.some((m) => m !== 'Shift')) return null;
  return [...mods, key].join('+');
}

function pickBindings(src: unknown, ids: readonly string[], displayOnly: boolean): Record<string, string | null> {
  const obj = src && typeof src === 'object' && !Array.isArray(src) ? (src as Record<string, unknown>) : {};
  const out: Record<string, string | null> = {};
  for (const id of ids) {
    const v = obj[id];
    out[id] = v === null || v === undefined ? null : toAccelerator(v, displayOnly) ? (v as string) : null;
  }
  return out;
}

/** Validate an untrusted payload (IPC or cached prefs) into known ids + valid bindings. */
export function sanitizeBindings(raw: unknown): Bindings {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const labelsSrc = r.labels && typeof r.labels === 'object' ? (r.labels as Record<string, unknown>) : {};
  const labels: Record<string, string> = {};
  for (const id of [...MENU_COMMANDS, ...DISPLAY_COMMANDS]) {
    const v = labelsSrc[id];
    if (typeof v === 'string' && v.trim()) labels[id] = v.replace(/[\r\n\t]/g, ' ').slice(0, 80);
  }
  return {
    menu: pickBindings(r.menu, MENU_COMMANDS, false),
    global: pickBindings(r.global, GLOBAL_COMMANDS, false),
    display: pickBindings(r.display, DISPLAY_COMMANDS, true),
    labels,
  };
}

let current: Bindings = DEFAULT_BINDINGS;
const registered = new Map<string, string>(); // command id → registered accelerator
const status: Record<string, GlobalStatus> = {};
let globalHandlers: Record<string, () => void> = {};

export function getBindings(): Bindings {
  return current;
}

/** Boot: apply the cached bindings so the menu and the global shortcut work before the studio loads (D-8). */
export function loadCachedBindings(handlers: Record<string, () => void>): Bindings {
  globalHandlers = handlers;
  const cached = getPrefs().keybindings;
  current = cached ? sanitizeBindings(cached) : DEFAULT_BINDINGS;
  registerGlobals(current.global);
  return current;
}

/** Register global shortcuts, unregistering the previous accelerator first (D-6). */
function registerGlobals(global: Record<string, string | null>): Record<string, GlobalStatus> {
  for (const id of GLOBAL_COMMANDS) {
    const prev = registered.get(id);
    const accel = global[id] ? toAccelerator(global[id]) : null;
    if (prev && prev !== accel) {
      globalShortcut.unregister(prev);
      registered.delete(id);
    }
    if (!global[id]) {
      delete status[id];
      continue;
    }
    if (!accel) {
      status[id] = 'invalid';
      continue;
    }
    if (registered.get(id) === accel) {
      status[id] = 'ok';
      continue;
    }
    const handler = globalHandlers[id];
    // register() returns false when another app (or the OS) owns the combo.
    const ok = !!handler && globalShortcut.register(accel, handler);
    if (ok) registered.set(id, accel);
    else log.warn(`global shortcut ${accel} for ${id} could not be registered`);
    status[id] = ok ? 'ok' : 'taken';
  }
  return { ...status };
}

/**
 * Apply a new set from the studio (D-4) and cache it (D-8). A refused global
 * shortcut is still applied here; the studio then re-sends the previous set,
 * which replaces this one, cache included (SPEC-11 AC-45).
 */
export function applyBindings(raw: unknown): { bindings: Bindings; global: Record<string, GlobalStatus> } {
  const next = sanitizeBindings(raw);
  const global = registerGlobals(next.global);
  current = next;
  updatePrefs({ keybindings: next });
  return { bindings: next, global };
}

export function unregisterAllGlobals(): void {
  globalShortcut.unregisterAll();
  registered.clear();
}
