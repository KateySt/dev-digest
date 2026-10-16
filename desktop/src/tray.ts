import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { iconsDir } from './config';
import { onActivity, type Activity } from './activity';
import { checkForUpdates } from './updater';

let tray: Tray | undefined;

const isMac = process.platform === 'darwin';

function icon(busy: boolean) {
  // macOS: a template image the menu bar tints; elsewhere the colour tile (amber while busy).
  const name = isMac ? 'trayTemplate.png' : busy ? 'tray-busy.png' : 'tray.png';
  const img = nativeImage.createFromPath(join(iconsDir(), name));
  if (isMac) img.setTemplateImage(true);
  return img;
}

function statusText({ running, unread }: Activity): string {
  const jobs = running === 0 ? 'Idle' : `${running} ${running === 1 ? 'job' : 'jobs'} running`;
  return unread ? `${jobs} · ${unread} unread` : jobs;
}

/**
 * System tray icon: status line (what's running, unread count), open the
 * window, check for updates, quit. Windows/Linux: a left-click opens the window.
 * The tray is also where the window goes when closed with close-to-tray on.
 */
export function createTray(showWindow: () => void): void {
  if (tray) return;
  tray = new Tray(icon(false));
  if (!isMac) tray.on('click', showWindow);

  let busy = false;
  onActivity((activity) => {
    if (!tray || tray.isDestroyed()) return;
    const status = statusText(activity);
    tray.setToolTip(`DevDigest — ${status}`);
    if (busy !== activity.running > 0) {
      busy = activity.running > 0;
      tray.setImage(icon(busy));
    }
    const template: MenuItemConstructorOptions[] = [
      { label: status, enabled: false },
      { type: 'separator' },
      { label: 'Open DevDigest', click: showWindow },
      { label: 'Check for Updates…', click: () => void checkForUpdates(true) },
      { type: 'separator' },
      { label: 'Quit DevDigest', click: () => app.quit() },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(template));
  });
}

export function destroyTray(): void {
  tray?.destroy();
  tray = undefined;
}
