import { app, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log/main';
import semver from 'semver';
import { GITHUB_OWNER, GITHUB_REPO, RELEASES_URL } from './config';

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/**
 * Windows: electron-updater pulls latest.yml + the NSIS installer from GitHub
 * Releases and installs on restart (unsigned is fine — no publisherName set).
 * macOS: auto-install needs a paid Developer ID signature, so we only compare
 * against the latest GitHub release and offer the download page.
 */
export function initUpdates(): void {
  if (!app.isPackaged) return;
  if (process.platform === 'win32') {
    autoUpdater.logger = log;
    autoUpdater.on('update-downloaded', async (info) => {
      const { response } = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `DevDigest ${info.version} has been downloaded.`,
        detail: 'Restart to install it. Otherwise it installs the next time you quit.',
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', (err) => log.warn('auto-update failed:', err.message));
  }
  void checkForUpdates(false);
  setInterval(() => void checkForUpdates(false), CHECK_EVERY_MS);
}

/** `interactive` (menu click) also reports "you're up to date" and errors. */
export async function checkForUpdates(interactive: boolean): Promise<void> {
  if (!app.isPackaged) {
    if (interactive) await dialog.showMessageBox({ message: 'Updates are only checked in the installed app.' });
    return;
  }
  try {
    if (process.platform === 'win32') {
      const result = await autoUpdater.checkForUpdates();
      const latest = result?.updateInfo.version;
      if (interactive && (!latest || !semver.gt(latest, app.getVersion()))) await upToDate();
      else if (interactive) await dialog.showMessageBox({ message: `Downloading DevDigest ${latest}…` });
      return;
    }
    await checkGithubRelease(interactive);
  } catch (err) {
    log.warn('update check failed:', (err as Error).message);
    if (interactive) await dialog.showMessageBox({ type: 'error', message: 'Could not check for updates.', detail: (err as Error).message });
  }
}

async function checkGithubRelease(interactive: boolean): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const release = (await res.json()) as { tag_name: string; html_url: string };
  const latest = semver.clean(release.tag_name);
  if (!latest || !semver.gt(latest, app.getVersion())) {
    if (interactive) await upToDate();
    return;
  }
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update available',
    message: `DevDigest ${latest} is available (you have ${app.getVersion()}).`,
    detail: 'Download the new .dmg and replace the app in Applications.',
  });
  if (response === 0) await shell.openExternal(release.html_url || RELEASES_URL);
}

function upToDate() {
  return dialog.showMessageBox({ message: `DevDigest ${app.getVersion()} is up to date.` });
}
