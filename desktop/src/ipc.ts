import { app, BrowserWindow, ipcMain, Notification, shell, type IpcMainInvokeEvent } from 'electron';
import { RELEASES_URL, WEB_URL, dataPaths } from './config';
import { checkForUpdates } from './updater';

/**
 * Main-process side of the preload bridge (preload.ts — keep channel names in
 * sync). Every handler first checks the call comes from one of our windows
 * showing the studio, so a navigated-away or foreign frame can't drive them.
 */
function ownWindow(e: IpcMainInvokeEvent): BrowserWindow | null {
  if (!e.senderFrame?.url.startsWith(WEB_URL)) return null;
  return BrowserWindow.fromWebContents(e.sender);
}

function handle(channel: string, fn: (win: BrowserWindow, arg: unknown) => unknown): void {
  ipcMain.handle(channel, (e, arg: unknown) => {
    const win = ownWindow(e);
    return win ? fn(win, arg) : undefined;
  });
}

interface NotifyRequest {
  title: string;
  body?: string | null;
  /** Studio route to open on click — relative only (`/repos/…`). */
  href?: string | null;
  silent?: boolean;
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Live toasts: Windows can GC a Notification before it is clicked. */
const shown = new Set<Notification>();

/**
 * OS notification for a finished long-running operation (the studio forwards
 * its notification stream here). Shown only while the window is not in focus
 * — in focus, the in-app bell is enough. Click → bring the window back and
 * tell the studio to open `href`.
 */
function showNotification(win: BrowserWindow, arg: unknown): boolean {
  const req = (arg ?? {}) as NotifyRequest;
  const title = clip(req.title, 200);
  if (!title || !Notification.isSupported()) return false;
  if (win.isFocused() && !win.isMinimized()) return false;
  const href = typeof req.href === 'string' && /^\/(?!\/)/.test(req.href) ? req.href : null;

  const toast = new Notification({ title, body: clip(req.body, 500), silent: req.silent === true });
  shown.add(toast);
  const forget = () => shown.delete(toast);
  toast.on('close', forget);
  toast.on('click', () => {
    forget();
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (href) win.webContents.send('app:navigate', href);
  });
  toast.show();
  return true;
}

export function registerIpc(): void {
  handle('window:minimize', (win) => win.minimize());
  handle('window:toggle-maximize', (win) => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  handle('window:close', (win) => win.close());
  handle('window:is-maximized', (win) => win.isMaximized());

  handle('app:version', () => app.getVersion());
  handle('app:notify', showNotification);
  handle('app:check-for-updates', () => checkForUpdates(true));
  handle('app:open-releases', () => shell.openExternal(RELEASES_URL));
  handle('app:open-logs', () => shell.openPath(dataPaths().logs));
  handle('app:open-data', () => shell.openPath(dataPaths().userData));
}

/** Push maximize/restore changes so the title bar can swap its icon. */
export function forwardMaximizeState(win: BrowserWindow): void {
  const send = () => win.webContents.send('window:maximized-changed', win.isMaximized());
  win.on('maximize', send);
  win.on('unmaximize', send);
}
