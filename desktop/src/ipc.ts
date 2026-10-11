import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
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

function handle(channel: string, fn: (win: BrowserWindow) => unknown): void {
  ipcMain.handle(channel, (e) => {
    const win = ownWindow(e);
    return win ? fn(win) : undefined;
  });
}

export function registerIpc(): void {
  handle('window:minimize', (win) => win.minimize());
  handle('window:toggle-maximize', (win) => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  handle('window:close', (win) => win.close());
  handle('window:is-maximized', (win) => win.isMaximized());

  handle('app:version', () => app.getVersion());
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
