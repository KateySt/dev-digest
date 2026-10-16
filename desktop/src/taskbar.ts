import { app, nativeImage, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { iconsDir } from './config';
import { onActivity } from './activity';

/**
 * Taskbar / Dock rendering of the studio's activity:
 * - something running → indeterminate progress (there's no single percentage
 *   across mixed reviews and evals, so we don't fake one);
 * - unread notifications → Dock badge count (macOS), badge count (Linux), or a
 *   red-dot overlay with the count as its accessible description (Windows).
 */
export function attachTaskbar(win: BrowserWindow): void {
  const overlay = process.platform === 'win32' ? nativeImage.createFromPath(join(iconsDir(), 'overlay-unread.png')) : null;

  const off = onActivity(({ running, unread }) => {
    if (win.isDestroyed()) return;
    // > 1 = indeterminate on Windows; macOS shows a full bar; < 0 removes it.
    win.setProgressBar(running > 0 ? 2 : -1, { mode: running > 0 ? 'indeterminate' : 'none' });

    if (process.platform === 'darwin') app.dock?.setBadge(unread ? String(unread) : '');
    else if (process.platform === 'win32') win.setOverlayIcon(unread ? overlay : null, unread ? `${unread} unread` : '');
    else app.setBadgeCount(unread);
  });
  win.once('closed', off);
}
