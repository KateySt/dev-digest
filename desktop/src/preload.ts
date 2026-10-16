// Preload for the main window: exposes a tiny, typed bridge to the studio as
// `window.devdigestDesktop` — custom title-bar window controls plus the actions
// that used to live in the native Help menu. Runs sandboxed, so it can only
// require 'electron' — channel names are duplicated in ipc.ts on purpose.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * Main → studio pushes that may arrive before React has subscribed (a deep link
 * delivered right after load, a toast clicked during hydration). Held here and
 * replayed to the first subscriber, so none is lost.
 */
function bufferedChannel<T>(channel: string) {
  const queue: T[] = [];
  const subscribers = new Set<(v: T) => void>();
  ipcRenderer.on(channel, (_e: IpcRendererEvent, value: T) => {
    if (subscribers.size === 0) queue.push(value);
    else for (const cb of subscribers) cb(value);
  });
  return (cb: (v: T) => void): (() => void) => {
    subscribers.add(cb);
    for (const v of queue.splice(0)) cb(v);
    return () => subscribers.delete(cb);
  };
}

const onNavigate = bufferedChannel<string>('app:navigate');
const onOpenPr = bufferedChannel<{ owner: string; repo: string; number: number }>('app:open-pr');

const bridge = {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    /** Subscribe to maximize/restore; returns the unsubscribe function. */
    onMaximizedChange(cb: (maximized: boolean) => void): () => void {
      const listener = (_e: IpcRendererEvent, maximized: boolean) => cb(maximized);
      ipcRenderer.on('window:maximized-changed', listener);
      return () => ipcRenderer.removeListener('window:maximized-changed', listener);
    },
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    /** Native menus, dialogs and the window background follow the studio's mode. */
    setThemeSource: (mode: 'dark' | 'light' | 'system'): Promise<void> => ipcRenderer.invoke('app:set-theme-source', mode),
    /** OS notification (only shown while the window is unfocused); resolves true if shown. */
    notify: (n: { title: string; body?: string | null; href?: string | null; silent?: boolean }): Promise<boolean> =>
      ipcRenderer.invoke('app:notify', n),
    /** Running jobs + unread count → taskbar progress, unread badge, tray status. */
    setActivity: (a: { running: number; unread: number }): Promise<void> => ipcRenderer.invoke('app:set-activity', a),
    /** Shell settings kept by the main process (desktop-prefs.json). */
    getPrefs: (): Promise<{ closeToTray: boolean }> => ipcRenderer.invoke('app:get-prefs'),
    setPrefs: (p: { closeToTray?: boolean }): Promise<{ closeToTray: boolean }> => ipcRenderer.invoke('app:set-prefs', p),
    /** A clicked OS notification asks the studio to open a route; returns the unsubscribe function. */
    onNavigate: (cb: (href: string) => void): (() => void) => onNavigate(cb),
    /** A `devdigest://pr?url=…` link asks the studio to open a GitHub PR; returns the unsubscribe function. */
    onOpenPr: (cb: (pr: { owner: string; repo: string; number: number }) => void): (() => void) => onOpenPr(cb),
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    openReleases: () => ipcRenderer.invoke('app:open-releases'),
    openLogsFolder: () => ipcRenderer.invoke('app:open-logs'),
    openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  },
};

contextBridge.exposeInMainWorld('devdigestDesktop', bridge);
