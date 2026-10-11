// Preload for the main window: exposes a tiny, typed bridge to the studio as
// `window.devdigestDesktop` — custom title-bar window controls plus the actions
// that used to live in the native Help menu. Runs sandboxed, so it can only
// require 'electron' — channel names are duplicated in ipc.ts on purpose.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

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
    /** OS notification (only shown while the window is unfocused); resolves true if shown. */
    notify: (n: { title: string; body?: string | null; href?: string | null; silent?: boolean }): Promise<boolean> =>
      ipcRenderer.invoke('app:notify', n),
    /** A clicked OS notification asks the studio to open a route; returns the unsubscribe function. */
    onNavigate(cb: (href: string) => void): () => void {
      const listener = (_e: IpcRendererEvent, href: string) => cb(href);
      ipcRenderer.on('app:navigate', listener);
      return () => ipcRenderer.removeListener('app:navigate', listener);
    },
    checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
    openReleases: () => ipcRenderer.invoke('app:open-releases'),
    openLogsFolder: () => ipcRenderer.invoke('app:open-logs'),
    openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  },
};

contextBridge.exposeInMainWorld('devdigestDesktop', bridge);
