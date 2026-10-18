/* KeyboardProvider — the one keyboard dispatcher (SPEC-11). Holds the effective
   bindings (registry defaults + the user's stored overrides), runs the command
   whose binding matches a keydown, and lets components register the handler
   for a command while they are mounted (`useCommand`) — a registered handler
   is what makes a command's scope "active" (AC-6). In the desktop app it also
   pushes menu/global bindings to the main process and runs commands the
   native menu sends back (AC-42). */
"use client";

import React from "react";
import { useSettings, useSaveKeybindings } from "@/lib/hooks";
import { useDesktop, type GlobalShortcutStatus } from "@/lib/desktop";
import { isTextInput } from "@/components/app-shell/helpers";
import { G_NAV_TIMEOUT_MS } from "@/components/app-shell/constants";
import { chordsForEvent, detectPlatform, isModified, isSingleKey } from "./keys";
import { commandById, visibleCommands } from "./registry";
import { useCommandLabel } from "./useCommandLabel";
import { effectiveBindings, parseStoredKeybindings, patchOverrides } from "./overrides";
import type { Binding, CommandDef, Overrides, Platform, StoredKeybindings } from "./types";

type Handler = () => void;

export type SaveResult = { ok: true } | { ok: false; reason: GlobalShortcutStatus };

export interface KeyboardContextValue {
  platform: Platform;
  desktop: boolean;
  /** Commands that exist in this runtime (desktop-only ones hidden in a browser). */
  commands: CommandDef[];
  /** id → effective binding (null = unbound or disabled). */
  effective: ReadonlyMap<string, Binding | null>;
  overrides: Overrides;
  /** Single-key shortcuts switch (WCAG 2.1.4). */
  singleKey: boolean;
  /** Effective binding that can fire right now (null when unbound, or single-key and switched off). */
  activeBinding: (id: string) => Binding | null;
  /** Global-shortcut registration status reported by the desktop. */
  globalStatus: Readonly<Record<string, GlobalShortcutStatus>>;
  /** Set (binding / null) or reset (undefined) overrides. */
  setBindings: (patch: Record<string, Binding | null | undefined>) => Promise<SaveResult>;
  setSingleKey: (on: boolean) => void;
  resetAll: () => void;
  run: (id: string) => boolean;
  register: (id: string, handler: Handler) => () => void;
  /** While a recorder captures keys, the dispatcher stays quiet. */
  setRecording: (on: boolean) => void;
}

const DEFAULT_PLATFORM: Platform = "other";
const noop = () => {};

const KeyboardContext = React.createContext<KeyboardContextValue>({
  platform: DEFAULT_PLATFORM,
  desktop: false,
  commands: visibleCommands(false),
  effective: effectiveBindings(visibleCommands(false), {}, DEFAULT_PLATFORM),
  overrides: {},
  singleKey: true,
  activeBinding: (id) => commandById(id)?.defaults[DEFAULT_PLATFORM] ?? null,
  globalStatus: {},
  setBindings: async () => ({ ok: true }),
  setSingleKey: noop,
  resetAll: noop,
  run: () => false,
  register: () => noop,
  setRecording: noop,
});

export function useKeyboard(): KeyboardContextValue {
  return React.useContext(KeyboardContext);
}

/** Run `handler` for command `id` while mounted (and while `enabled`). */
export function useCommand(id: string, handler: Handler, enabled = true): void {
  const { register } = useKeyboard();
  const ref = React.useRef(handler);
  ref.current = handler;
  React.useEffect(() => {
    if (!enabled) return;
    return register(id, () => ref.current());
  }, [register, id, enabled]);
}

const isMenuDisplay = (c: CommandDef) => c.id === "palette.open" || c.id === "help.show";

/** Bindings the desktop applies: menu accelerators, global shortcuts, menu display hints, labels. */
function desktopPayload(
  commands: CommandDef[],
  effective: ReadonlyMap<string, Binding | null>,
  label: (c: CommandDef) => string,
) {
  const pick = (pred: (c: CommandDef) => boolean) =>
    Object.fromEntries(commands.filter(pred).map((c) => [c.id, effective.get(c.id) ?? null]));
  return {
    menu: pick((c) => c.owner === "menu"),
    global: pick((c) => c.owner === "os"),
    // Studio-owned keys the menu only shows (D-3): it must not swallow them.
    display: pick(isMenuDisplay),
    labels: Object.fromEntries(commands.filter((c) => c.owner === "menu" || isMenuDisplay(c)).map((c) => [c.id, label(c)])),
  };
}

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const bridge = useDesktop();
  const desktop = !!bridge;
  const [detected, setDetected] = React.useState<Platform>(DEFAULT_PLATFORM);
  React.useEffect(() => setDetected(detectPlatform()), []);
  const platform: Platform = bridge ? (bridge.platform === "darwin" ? "mac" : "other") : detected;

  const label = useCommandLabel();
  const { data: settings } = useSettings();
  const { save } = useSaveKeybindings();
  const stored: StoredKeybindings = React.useMemo(
    () => parseStoredKeybindings(settings?.keybindings, platform),
    [settings?.keybindings, platform],
  );
  const commands = React.useMemo(() => visibleCommands(desktop), [desktop]);
  const effective = React.useMemo(
    () => effectiveBindings(commands, stored.overrides, platform),
    [commands, stored.overrides, platform],
  );

  const activeBinding = React.useCallback(
    (id: string) => {
      const b = effective.get(id) ?? null;
      return b && !stored.singleKey && isSingleKey(b) ? null : b;
    },
    [effective, stored.singleKey],
  );

  // ---- handlers -----------------------------------------------------------
  const handlers = React.useRef(new Map<string, Handler[]>());
  const register = React.useCallback((id: string, handler: Handler) => {
    const list = handlers.current.get(id) ?? [];
    handlers.current.set(id, [...list, handler]);
    return () => {
      const rest = (handlers.current.get(id) ?? []).filter((h) => h !== handler);
      if (rest.length) handlers.current.set(id, rest);
      else handlers.current.delete(id);
    };
  }, []);
  const run = React.useCallback((id: string) => {
    const list = handlers.current.get(id);
    if (!list?.length) return false;
    list[list.length - 1]!(); // innermost (last-mounted) handler wins
    return true;
  }, []);

  // ---- dispatcher ---------------------------------------------------------
  const recording = React.useRef(false);
  const setRecording = React.useCallback((on: boolean) => {
    recording.current = on;
  }, []);

  React.useEffect(() => {
    // Only the studio's own keys: menu accelerators and global shortcuts are
    // received by the desktop, which sends the command id back (AC-42).
    const live = commands
      .filter((c) => c.owner === "studio")
      .map((c) => ({ id: c.id, binding: activeBinding(c.id) }))
      .filter((c): c is { id: string; binding: Binding } => !!c.binding);

    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearPending = () => {
      pending = null;
      clearTimeout(timer);
    };

    const onKey = (e: KeyboardEvent) => {
      if (recording.current || e.isComposing || e.defaultPrevented) return;
      const chords = chordsForEvent(e, platform);
      if (!chords.length) return;
      const typing = isTextInput(e.target);
      const allowed = (chord: string) => !typing || isModified(chord);

      // Second key of a sequence ("G then P").
      if (pending) {
        const first = pending;
        clearPending();
        for (const chord of chords) {
          const hit = live.find((c) => c.binding === `${first} ${chord}` && handlers.current.has(c.id));
          if (hit && allowed(chord)) {
            e.preventDefault();
            run(hit.id);
            return;
          }
        }
      }

      for (const chord of chords) {
        if (!allowed(chord)) continue;
        const hit = live.find((c) => c.binding === chord && handlers.current.has(c.id));
        if (hit) {
          e.preventDefault();
          run(hit.id);
          return;
        }
      }

      // Start of a sequence some active command waits for.
      const chord = chords[0]!;
      if (allowed(chord) && live.some((c) => c.binding.startsWith(`${chord} `) && handlers.current.has(c.id))) {
        pending = chord;
        timer = setTimeout(clearPending, G_NAV_TIMEOUT_MS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [commands, activeBinding, platform, run]);

  // ---- desktop sync -------------------------------------------------------
  const [globalStatus, setGlobalStatus] = React.useState<Record<string, GlobalShortcutStatus>>({});
  const pushToDesktop = React.useCallback(
    async (eff: ReadonlyMap<string, Binding | null>) => {
      if (!bridge) return { global: {} as Record<string, GlobalShortcutStatus> };
      const res = await bridge.app.setKeybindings(desktopPayload(commands, eff, label));
      setGlobalStatus(res.global);
      return res;
    },
    [bridge, commands, label],
  );
  React.useEffect(() => {
    void pushToDesktop(effective);
  }, [pushToDesktop, effective]);
  React.useEffect(() => bridge?.app.onCommand((id) => void run(id)), [bridge, run]);

  // ---- saving -------------------------------------------------------------
  const persist = save;

  const setBindings = React.useCallback(
    async (patch: Record<string, Binding | null | undefined>): Promise<SaveResult> => {
      const overrides = patchOverrides(stored.overrides, patch);
      // A global shortcut is saved only once the OS accepted it (AC-45).
      const globals = Object.keys(patch).filter((id) => commandById(id)?.owner === "os");
      if (bridge && globals.length) {
        const candidate = effectiveBindings(commands, overrides, platform);
        const res = await pushToDesktop(candidate);
        const failed = globals.find((id) => candidate.get(id) && res.global[id] && res.global[id] !== "ok");
        if (failed) {
          await pushToDesktop(effective); // restore what was active
          return { ok: false, reason: res.global[failed]! };
        }
      }
      persist({ ...stored, overrides });
      return { ok: true };
    },
    [bridge, commands, effective, persist, platform, pushToDesktop, stored],
  );
  const setSingleKey = React.useCallback((on: boolean) => persist({ ...stored, singleKey: on }), [persist, stored]);
  const resetAll = React.useCallback(() => persist({ ...stored, overrides: {} }), [persist, stored]);

  const value = React.useMemo<KeyboardContextValue>(
    () => ({
      platform,
      desktop,
      commands,
      effective,
      overrides: stored.overrides,
      singleKey: stored.singleKey,
      activeBinding,
      globalStatus,
      setBindings,
      setSingleKey,
      resetAll,
      run,
      register,
      setRecording,
    }),
    [platform, desktop, commands, effective, stored, activeBinding, globalStatus, setBindings, setSingleKey, resetAll, run, register, setRecording],
  );

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}
