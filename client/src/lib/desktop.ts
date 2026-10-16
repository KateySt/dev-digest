/* desktop.ts — the Electron preload bridge (desktop/src/preload.ts), typed.
   `window.devdigestDesktop` only exists inside the desktop app; in a browser
   useDesktop() returns null and every desktop-only control renders nothing. */
"use client";

import React, { useSyncExternalStore } from "react";

export interface DesktopPrefs {
  /** Windows/Linux: closing the window keeps DevDigest running in the tray. */
  closeToTray: boolean;
}

export interface DesktopBridge {
  platform: string;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    isMaximized(): Promise<boolean>;
    /** Returns the unsubscribe function. */
    onMaximizedChange(cb: (maximized: boolean) => void): () => void;
  };
  app: {
    getVersion(): Promise<string>;
    /** Native menus, dialogs and the window background follow the studio's mode. */
    setThemeSource(mode: "dark" | "light" | "system"): Promise<void>;
    /** OS notification — shown only while the window is unfocused; resolves true if shown. */
    notify(n: { title: string; body?: string | null; href?: string | null; silent?: boolean }): Promise<boolean>;
    /** Running jobs + unread count → taskbar progress, unread badge, tray status. */
    setActivity(a: { running: number; unread: number }): Promise<void>;
    /** Shell settings kept by the main process (desktop-prefs.json). */
    getPrefs(): Promise<DesktopPrefs>;
    setPrefs(p: Partial<DesktopPrefs>): Promise<DesktopPrefs>;
    /** A clicked OS notification asks the studio to open a route. Returns the unsubscribe function. */
    onNavigate(cb: (href: string) => void): () => void;
    checkForUpdates(): Promise<void>;
    openReleases(): Promise<void>;
    openLogsFolder(): Promise<void>;
    openDataFolder(): Promise<void>;
  };
}

declare global {
  interface Window {
    devdigestDesktop?: DesktopBridge;
  }
}

const noopSubscribe = () => () => {};

/**
 * The desktop bridge, or null in a browser. Null on the server and during
 * hydration (server snapshot), then the real value — no hydration mismatch.
 */
export function useDesktop(): DesktopBridge | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.devdigestDesktop ?? null,
    () => null,
  );
}

/**
 * The main process's shell prefs, or null until loaded / in a browser. Not
 * server data — the bridge is the source of truth, so a local mirror is fine;
 * `update` applies optimistically and settles on what main saved.
 */
export function useDesktopPrefs(): [DesktopPrefs | null, (p: Partial<DesktopPrefs>) => void] {
  const desktop = useDesktop();
  const [prefs, setPrefs] = React.useState<DesktopPrefs | null>(null);

  React.useEffect(() => {
    if (!desktop) return;
    let live = true;
    void desktop.app.getPrefs().then((p) => live && setPrefs(p));
    return () => {
      live = false;
    };
  }, [desktop]);

  const update = React.useCallback(
    (patch: Partial<DesktopPrefs>) => {
      if (!desktop) return;
      setPrefs((prev) => (prev ? { ...prev, ...patch } : prev));
      void desktop.app.setPrefs(patch).then(setPrefs);
    },
    [desktop],
  );
  return [prefs, update];
}
