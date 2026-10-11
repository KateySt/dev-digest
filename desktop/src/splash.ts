import { app, BrowserWindow } from 'electron';

// Startup splash shown while the API and the studio boot. Self-contained HTML
// (data: URL, no network): the app's logo mark, an accent spinner, a status
// line main.ts updates as boot advances, and the version. Colours mirror the
// studio's dark theme (client/src/vendor/ui/styles.css).

// lucide "layers" — the same mark as the studio's sidebar logo.
const LOGO_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2"
stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>
<path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`;

function splashHtml(version: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #fafafa; user-select: none; -webkit-app-region: drag;
    background: radial-gradient(120% 90% at 50% 0%, #161a24 0%, #0a0a0a 60%);
    border: 1px solid #1f1f1f;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .mark {
    width: 40px; height: 40px; border-radius: 10px; background: #fafafa;
    display: grid; place-items: center; box-shadow: 0 8px 28px rgba(59,130,246,.25);
  }
  .name { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .spinner {
    margin-top: 30px; width: 26px; height: 26px; border-radius: 50%;
    border: 2.5px solid rgba(255,255,255,.08); border-top-color: #3b82f6;
    animation: spin .8s linear infinite;
  }
  .status { margin-top: 14px; font-size: 12.5px; color: #a1a1aa; min-height: 16px; transition: opacity .2s; }
  .version { position: fixed; bottom: 12px; font-size: 11px; color: #52525b; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
</style></head><body>
  <div class="brand"><div class="mark">${LOGO_SVG}</div><div class="name">DevDigest</div></div>
  <div class="spinner" role="progressbar" aria-label="Loading"></div>
  <div class="status" id="status">Starting…</div>
  <div class="version">v${version}</div>
</body></html>`;
}

export function createSplash(): BrowserWindow {
  const splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    show: false,
    center: true,
    backgroundColor: '#0a0a0a',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.once('ready-to-show', () => splash.show());
  void splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(app.getVersion()))}`);
  return splash;
}

/** Update the status line under the spinner (no-op once the splash is gone). */
export function setSplashStatus(splash: BrowserWindow, text: string): void {
  if (splash.isDestroyed()) return;
  const { webContents } = splash;
  const apply = () => {
    if (splash.isDestroyed()) return;
    void webContents
      .executeJavaScript(`document.getElementById('status').textContent = ${JSON.stringify(text)};`)
      .catch(() => {});
  };
  // The first update can race the data: URL load — wait for the DOM.
  if (webContents.isLoading()) webContents.once('did-finish-load', apply);
  else apply();
}
