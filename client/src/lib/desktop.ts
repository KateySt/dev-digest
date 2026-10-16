/* desktop.ts — the Electron preload bridge (desktop/src/preload.ts), typed.
   `window.devdigestDesktop` only exists inside the desktop app; in a browser
   useDesktop() returns null and every desktop-only control renders nothing. */
"use client";

import { useSyncExternalStore } from "react";

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
