/* Test helper: a fake preload bridge installed on window.devdigestDesktop. */
import { vi } from "vitest";
import type { DesktopBridge } from "@/lib/desktop";

export function installFakeBridge(platform = "win32") {
  let maximizedListener: ((m: boolean) => void) | null = null;
  let navigateListener: ((href: string) => void) | null = null;
  const bridge: DesktopBridge = {
    platform,
    window: {
      minimize: vi.fn(async () => {}),
      toggleMaximize: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn((cb: (m: boolean) => void) => {
        maximizedListener = cb;
        return () => (maximizedListener = null);
      }),
    },
    app: {
      getVersion: vi.fn(async () => "0.1.1"),
      notify: vi.fn(async () => true),
      onNavigate: vi.fn((cb: (href: string) => void) => {
        navigateListener = cb;
        return () => (navigateListener = null);
      }),
      checkForUpdates: vi.fn(async () => {}),
      openReleases: vi.fn(async () => {}),
      openLogsFolder: vi.fn(async () => {}),
      openDataFolder: vi.fn(async () => {}),
    },
  };
  window.devdigestDesktop = bridge;
  return {
    bridge,
    emitMaximized: (m: boolean) => maximizedListener?.(m),
    emitNavigate: (href: string) => navigateListener?.(href),
  };
}

export function removeFakeBridge() {
  delete window.devdigestDesktop;
}
