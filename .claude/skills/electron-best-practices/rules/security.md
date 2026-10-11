# Security — webPreferences, content, CSP, permissions, external links

Source: Electron security checklist (electronjs.org/docs/latest/tutorial/security).

## S1 — Isolate every renderer

```ts
new BrowserWindow({
  webPreferences: {
    contextIsolation: true, // default since 12 — still set it explicitly
    sandbox: true,          // default since 20
    nodeIntegration: false, // default since 5
    preload: join(__dirname, 'preload.js'),
  },
});
```

**Why explicit:** defaults change, and a reviewer can't see an omitted key.
`nodeIntegration: true` silently disables the sandbox; `contextIsolation:
false` disables it too, whatever `sandbox` says.

Also forbidden in production: `nodeIntegrationInSubFrames`, `nodeIntegrationInWorker`,
`<webview>` (prefer `WebContentsView`; if a `<webview>` is unavoidable, strip its
`preload` and force `nodeIntegration: false` in `will-attach-webview`).

**Exceptions**
- A window that only ever shows a `data:` URL built from constants (a splash)
  may skip `preload`. It still sets the three flags explicitly.

## S2 — Never weaken web security

Never set: `webSecurity: false`, `allowRunningInsecureContent: true`,
`experimentalFeatures: true`, `enableBlinkFeatures: '…'`.

**Exceptions**
- `enableBlinkFeatures` for one named feature with no stable alternative, with a
  comment naming the feature and the reason. Never to "fix CORS" — fix CORS on
  the server instead.

## S3 — Only load secure content

Remote resources (`loadURL`, `fetch`, scripts, websockets) use `https:` / `wss:`.

**Exceptions**
- An app-owned server bound to `127.0.0.1` (DevDigest E1). Never `localhost`
  (may resolve to `::1` or be hijacked via hosts file), never `0.0.0.0`.

## S4 — Content Security Policy

Every page the app serves sends a CSP. With a served app (Next.js), set it in
the web server's headers; alternatively inject it from main:

```ts
session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
  cb({ responseHeaders: { ...details.responseHeaders,
    'Content-Security-Policy': ["default-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:43101"] } });
});
```

`file://` pages can't receive headers — use `<meta http-equiv>` (and see
navigation-windows.md: prefer a custom protocol over `file://`).

**Exceptions**
- `style-src 'unsafe-inline'` when the UI framework requires it.
- `'unsafe-eval'` only in dev builds (HMR). Never in a packaged build.

## S5 — Permission handlers, deny by default

Electron **auto-approves** every permission request (camera, mic, geolocation,
notifications, clipboard-read, …) unless you install handlers.

```ts
const ALLOWED = new Set(['clipboard-sanitized-write', 'notifications']);
const ses = session.defaultSession; // only after app.whenReady()
ses.setPermissionRequestHandler((wc, permission, callback, details) => {
  const ok = isOwnOrigin(details.requestingUrl) && ALLOWED.has(permission);
  callback(ok); // exactly once on every path
});
ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
  requestingOrigin === WEB_ORIGIN && ALLOWED.has(permission));
```

**Exceptions:** none. If the app needs nothing, deny everything.

## S6 — `shell.openExternal` only with vetted URLs

`openExternal` hands the URL to the OS; `file:`, `smb:`, custom protocol
handlers, or `ms-msdt:`-style URIs can execute code.

```ts
function openExternalSafe(raw: string): void {
  let url: URL;
  try { url = new URL(raw); } catch { return; }
  if (url.protocol !== 'https:') return; // add 'mailto:' only if needed
  void shell.openExternal(url.toString());
}
```

`shell.openPath` is for app-owned paths only (logs, data dir) — never a
renderer-supplied path.

**Exceptions**
- Constant URLs from `config.ts` (`RELEASES_URL`, `GIT_DOWNLOAD_URL`) need no re-check.
- `http:` links to arbitrary sites: allowed only if the product explicitly wants
  it; otherwise upgrade-or-drop.

## Secrets at rest

Prefer `safeStorage.encryptString` for tokens on Windows/Linux. On macOS it
needs a properly signed app (Keychain); with ad-hoc signing (DevDigest E3) don't
rely on it — document where secrets live instead.
