import { app, BrowserWindow, dialog, Notification } from 'electron';
import log from 'electron-log/main';
import { join } from 'node:path';
import { API_PORT, API_URL, GIT_DOWNLOAD_URL, WEB_PORT, WEB_URL, dataPaths } from './config';
import { hasGit, isPortFree } from './preflight';
import { startApi, startWeb, stop, waitForHttp, type Child } from './processes';
import { buildMenu } from './menu';
import { forwardMaximizeState, registerIpc } from './ipc';
import { initUpdates } from './updater';
import { createSplash, setSplashStatus } from './splash';
import { isOwnOrigin, openExternalSafe } from './validate';
import { getPrefs, loadPrefs, updatePrefs } from './prefs';
import { createTray } from './tray';
import { attachTaskbar } from './taskbar';
import { loadSecretsKey } from './secrets-key';
import { deepLinkFromArgv, handleDeepLink, registerProtocol, setDeepLinkTarget } from './deep-link';
import { initTheme, windowBackground } from './theme';
import { attachContextMenu } from './context-menu';

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
let trayHint: Notification | undefined;

if (!app.requestSingleInstanceLock()) {
  // A second launch would fight over the ports and PGlite's single-process data dir.
  app.quit();
} else {
  // A link clicked while we run (Windows/Linux) starts a second instance carrying it.
  app.on('second-instance', (_event, argv) => {
    handleDeepLink(deepLinkFromArgv(argv));
    showWindow();
  });
  // macOS delivers links as an event — it can fire before `ready`, so it's registered here.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
    if (app.isReady()) showWindow();
  });
  // Cold start from a link (Windows/Linux): it is on our own command line.
  handleDeepLink(deepLinkFromArgv(process.argv));
  app.whenReady().then(boot).catch((err) => fatal('DevDigest failed to start', err));
}

async function boot(): Promise<void> {
  // Windows drops toasts from an installed app unless they carry its AppUserModelID
  // (electron-builder's appId). No-op elsewhere.
  if (process.platform === 'win32') app.setAppUserModelId('dev.devdigest.app');
  loadPrefs();
  initTheme();
  registerProtocol();
  buildMenu();
  registerIpc();
  const splash = createSplash();
  setSplashStatus(splash, 'Checking ports…');

  for (const port of [API_PORT, WEB_PORT]) {
    if (!(await isPortFree(port))) {
      throw new Error(`Port ${port} on 127.0.0.1 is already in use. Close the program using it and start DevDigest again.`);
    }
  }
  if (!(await hasGit())) void warnNoGit();

  log.info('data dir:', dataPaths().userData);
  setSplashStatus(splash, 'Starting services…');
  api = startApi(loadSecretsKey());
  web = startWeb();
  watchCrash(api);
  watchCrash(web);
  await Promise.all([
    waitForHttp(`${API_URL}/health/ready`, api).then(() => setSplashStatus(splash, 'Loading the studio…')),
    waitForHttp(WEB_URL, web),
  ]);

  createWindow();
  createTray(showWindow);
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
    backgroundColor: windowBackground(),
    // Custom title bar: the studio's top bar is the window's title bar (drag
    // region + its own window controls, via the preload bridge). macOS keeps
    // its native traffic lights, centred in the 52px top bar.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' && { trafficLightPosition: { x: 18, y: 20 } }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.js'),
    },
  });
  // The native menu bar is replaced by the account menu; keeping the menu
  // itself (just hidden) keeps its accelerators — copy/paste, reload, devtools.
  mainWindow.setMenuBarVisibility(false);
  forwardMaximizeState(mainWindow);
  attachContextMenu(mainWindow);
  attachTaskbar(mainWindow);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Links to GitHub PRs, docs, etc. open in the default browser (https only),
  // never in the app; the window itself never leaves the studio's origin.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isOwnOrigin(url)) openExternalSafe(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isOwnOrigin(url)) return;
    event.preventDefault();
    openExternalSafe(url);
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isOwnOrigin(url)) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (quitting || !closesToTray()) return;
    event.preventDefault();
    mainWindow?.hide();
    showTrayHintOnce();
  });
  mainWindow.on('closed', () => (mainWindow = undefined));
  const win = mainWindow;
  win.webContents.once('did-finish-load', () => setDeepLinkTarget(win));
  void mainWindow.loadURL(WEB_URL);
}

/** Bring the window back from the tray, the taskbar or behind other windows. */
function showWindow(): void {
  if (!mainWindow) {
    if (web && !quitting) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Windows/Linux only — on macOS closing the window already keeps the app in the Dock. */
function closesToTray(): boolean {
  return process.platform !== 'darwin' && getPrefs().closeToTray;
}

/** First close-to-tray: tell the user the app is still running, once. */
function showTrayHintOnce(): void {
  if (getPrefs().trayHintShown || !Notification.isSupported()) return;
  updatePrefs({ trayHintShown: true });
  // Held in a module variable: Windows can GC a toast before it is shown/clicked.
  trayHint = new Notification({
    title: 'DevDigest is still running',
    body: 'It keeps working in the system tray. Quit from the tray menu, or turn this off in Settings → Notifications.',
  });
  trayHint.show();
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
  if (response === 0) openExternalSafe(GIT_DOWNLOAD_URL);
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
