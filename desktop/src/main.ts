import { app, BrowserWindow, dialog, shell } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import { API_PORT, API_URL, GIT_DOWNLOAD_URL, WEB_PORT, WEB_URL, dataPaths } from './config';
import { hasGit, isPortFree } from './preflight';
import { startApi, startWeb, stop, waitForHttp, type Child } from './processes';
import { buildMenu } from './menu';
import { initUpdates } from './updater';

// `pnpm start` keeps its DB/logs apart from the installed app's.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'DevDigest-dev'));
  app.setAppLogsPath(join(app.getPath('userData'), 'logs'));
}
log.initialize();

let api: Child | undefined;
let web: Child | undefined;
let mainWindow: BrowserWindow | undefined;
let quitting = false;

const SPLASH_HTML = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;
justify-content:center;font-family:system-ui,sans-serif;background:#0b0d12;color:#e6e8ee">
<div style="text-align:center"><div style="font-size:22px;font-weight:600">DevDigest</div>
<div style="margin-top:8px;opacity:.6;font-size:13px">Starting…</div></div></body></html>`;

if (!app.requestSingleInstanceLock()) {
  // A second launch would fight over the ports and PGlite's single-process data dir.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(boot).catch((err) => fatal('DevDigest failed to start', err));
}

async function boot(): Promise<void> {
  buildMenu();
  const splash = new BrowserWindow({ width: 360, height: 200, frame: false, resizable: false, show: false });
  splash.once('ready-to-show', () => splash.show());
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH_HTML)}`);

  for (const port of [API_PORT, WEB_PORT]) {
    if (!(await isPortFree(port))) {
      throw new Error(`Port ${port} on 127.0.0.1 is already in use. Close the program using it and start DevDigest again.`);
    }
  }
  if (!(await hasGit())) void warnNoGit();

  log.info('data dir:', dataPaths().userData);
  api = startApi();
  web = startWeb();
  watchCrash(api);
  watchCrash(web);
  await Promise.all([waitForHttp(`${API_URL}/health/ready`, api), waitForHttp(WEB_URL, web)]);

  createWindow();
  splash.destroy();
  initUpdates();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'DevDigest',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Links to GitHub PRs, docs, etc. open in the default browser, not in the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(WEB_URL)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(WEB_URL)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.on('closed', () => (mainWindow = undefined));
  void mainWindow.loadURL(WEB_URL);
}

function watchCrash(child: Child): void {
  void child.exited.then((code) => {
    if (!quitting) fatal(`The DevDigest ${child.name} process stopped unexpectedly (code ${code}).`);
  });
}

async function warnNoGit(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Download Git', 'Continue'],
    defaultId: 0,
    cancelId: 1,
    message: 'Git was not found',
    detail: 'DevDigest needs Git to clone and review repositories. Install it, then restart DevDigest.',
  });
  if (response === 0) void shell.openExternal(GIT_DOWNLOAD_URL);
}

function fatal(message: string, err?: unknown): void {
  log.error(message, err);
  if (quitting) return;
  const detail = `${err instanceof Error ? err.message + '\n\n' : ''}Logs: ${dataPaths().logs}`;
  dialog.showErrorBox('DevDigest', `${message}\n\n${detail}`);
  app.quit();
}

// Stop the children before exiting — the API must close PGlite cleanly. Also
// runs on autoUpdater.quitAndInstall(), so the installer never sees a locked DB.
app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  void Promise.allSettled([api && stop(api, true), web && stop(web, false)]).finally(() => app.quit());
});

app.on('window-all-closed', () => {
  // macOS convention: closing the window keeps the app alive in the Dock.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow && web && !quitting) createWindow();
});
