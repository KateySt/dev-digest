# Navigation, new windows, window chrome

## N1 — Limit navigation to your origin

```ts
const isOwn = (raw: string) => { try { return new URL(raw).origin === WEB_ORIGIN; } catch { return false; } };

win.webContents.on('will-navigate', (event, url) => {
  if (isOwn(url)) return;
  event.preventDefault();
  openExternalSafe(url); // see security.md S6
});
win.webContents.on('will-redirect', (event, url) => { if (!isOwn(url)) event.preventDefault(); });
```

For apps with iframes also handle `will-frame-navigate`. Apply the guard to
every `webContents` — the safest place is `app.on('web-contents-created', …)`,
which also catches windows you forget about.

In-app client-side routing (`history.pushState`) doesn't fire `will-navigate`;
only real document navigations do.

## N2 — Deny new windows by default

```ts
win.webContents.setWindowOpenHandler(({ url }) => {
  openExternalSafe(url);
  return { action: 'deny' };
});
```

**Exceptions**
- An app-owned popup (e.g. OAuth) may return `{ action: 'allow',
  overrideBrowserWindowOptions: { webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } } }`
  — and it inherits no preload unless you pass one deliberately.
- Since Electron 39 popups are always resizable; set `resizable` in
  `overrideBrowserWindowOptions` if that matters.

## N3 — Compare origins, not strings

`startsWith`, `includes`, `endsWith('.example.com')` and regexes on raw URL
strings are all bypassable (userinfo `@`, extra subdomains, ports). Parse with
`new URL()` inside `try/catch` (invalid → reject) and compare `.origin` against
a constant origin. One shared `isOwnOrigin(url)` helper serves navigation,
window-open, permission, and IPC checks.

**Exceptions:** none.

## Prefer custom protocols over `file://`

If the app ships local HTML, serve it via `protocol.handle('app', …)` restricted
to a known directory, and flip `grantFileProtocolExtraPrivileges` off. A
`file://` page with an XSS can read any file on disk.

**Exceptions:** constant `data:` splash pages.

## Window creation & chrome

- Create with `show: false`, show on `ready-to-show`, set `backgroundColor` to
  the app's background — no white flash.
- Frameless / `titleBarStyle: 'hidden'`: the page must provide drag regions
  (`-webkit-app-region: drag`) and window controls; interactive elements inside
  a drag region need `no-drag`. Every full-screen page needs them, or the window
  can't be moved or closed (DevDigest: `<TitlebarStrip />`).
- macOS: keep traffic lights (`trafficLightPosition`), handle `activate` by
  recreating the window if none exist.
- Restore + focus the existing window on `second-instance`.
- Persist/restore bounds only after checking they fit a current display
  (`screen.getAllDisplays()`), or windows open off-screen after a monitor change.
