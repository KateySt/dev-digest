---
name: electron-best-practices
description: "Use when writing, reviewing, or refactoring Electron code — anything under desktop/ (main.ts, preload.ts, ipc.ts, processes.ts, updater.ts, menu.ts, electron-builder.yml, scripts/after-pack.cjs) or a client/ component that calls window.devdigestDesktop. Covers BrowserWindow webPreferences, contextBridge/preload, ipcMain.handle/ipcRenderer.invoke, IPC sender validation, will-navigate/setWindowOpenHandler, shell.openExternal, permission handlers, CSP, utilityProcess, app lifecycle/quit, Notification, fuses, ASAR integrity, electron-builder, electron-updater, code signing, and upgrading Electron majors. Trigger terms: Electron, BrowserWindow, preload, contextBridge, ipcMain, ipcRenderer, webContents, utilityProcess, electron-builder, electron-updater, fuses, asar, sandbox, contextIsolation, nodeIntegration."
---

# Electron best practices (Electron 44, Oct 2026)

Every rule below is a **default**. An exception is allowed only when it is
listed in that rule's **Exceptions** column/section, and the code carries a
comment saying which exception applies and why. No listed exception → follow
the rule.

The **renderer is untrusted**, even when it shows your own UI: an XSS, a
compromised npm dependency in the web bundle, or a navigation to a foreign
page turns it into an attacker. Every rule follows from that — the main process
is the only trusted code, and preload + IPC are the boundary it defends.

## How to use

1. Find the rows of the quick-reference table that your change touches.
2. Open the matching rule file for code, rationale, and exceptions:
   - [rules/security.md](rules/security.md) — webPreferences, CSP, permissions, secure content, `shell.openExternal`
   - [rules/ipc-preload.md](rules/ipc-preload.md) — preload bridge, channel design, sender + payload validation
   - [rules/navigation-windows.md](rules/navigation-windows.md) — `will-navigate`, `setWindowOpenHandler`, origin checks, frameless windows
   - [rules/processes-lifecycle.md](rules/processes-lifecycle.md) — main-process blocking, `utilityProcess`, single instance, quit sequence, notifications
   - [rules/packaging-updates.md](rules/packaging-updates.md) — fuses, ASAR integrity, electron-builder, signing, electron-updater, Electron upgrades
   - [rules/performance.md](rules/performance.md) — startup, lazy loading, bundling, menus
3. Check the [DevDigest exceptions](#devdigest-exceptions-already-approved) — these are the only project-wide deviations already approved.

## Quick reference

| # | Rule | Default (do this) | Allowed exceptions |
|---|------|-------------------|--------------------|
| S1 | Isolation | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on **every** window/view, set explicitly | None. A constant `data:` splash may omit `preload` — not the three flags. |
| S2 | Web security | Never `webSecurity: false`, `allowRunningInsecureContent`, `experimentalFeatures`, `enableBlinkFeatures` | A Blink feature with a named need, a comment, and no safer API — never "to make it work". |
| S3 | Secure content | Load remote resources over `https:`/`wss:` | Loopback (`127.0.0.1`) servers owned by the app (DevDigest exception E1). |
| S4 | CSP | Restrictive CSP (`script-src 'self'`) on every page the app serves (DevDigest: `client/next.config.*` headers) | Framework-required `'unsafe-inline'` styles; never `'unsafe-eval'` in production. |
| S5 | Permissions | `setPermissionRequestHandler` + `setPermissionCheckHandler` deny by default, allow by `(origin, permission)` allowlist | None — Electron auto-grants everything otherwise. |
| S6 | `shell.openExternal` | Only `https:`(and `mailto:` if needed) URLs, parsed with `new URL()` | Fixed constant URLs from config need no re-check. |
| I1 | Bridge shape | One named function per action via `contextBridge`; never expose `ipcRenderer`, `send`, `invoke`, or `on` raw | None. |
| I2 | Listeners | Wrap callbacks so the renderer never receives the `IpcRendererEvent`; return an unsubscribe function | None. |
| I3 | Two-way IPC | `ipcRenderer.invoke` ↔ `ipcMain.handle` | `send`/`on` for fire-and-forget; `MessagePort` for streams. Never `sendSync`, never `@electron/remote`. |
| I4 | Sender check | Every handler validates `event.senderFrame` **origin** (not URL prefix) before acting | Handlers returning only public, static data (e.g. app version) — still cheap to check, so check anyway. |
| I5 | Payload check | Treat every IPC argument as `unknown`; validate type, length, allowed values | None. |
| N1 | Navigation | `will-navigate` (+ `will-redirect`, `will-frame-navigate`) allow only your origin; send others to the browser via S6 | None. |
| N2 | New windows | `setWindowOpenHandler` returns `{ action: 'deny' }` by default | An app-owned window with explicit hardened `overrideBrowserWindowOptions`. |
| N3 | Origin compare | `new URL(url).origin === EXPECTED_ORIGIN` | None — `startsWith` is bypassable (`http://127.0.0.1:43100@evil.com`). |
| P1 | Main thread | No sync I/O, no CPU-heavy loops, no `*Sync` child_process in IPC handlers, event handlers, timers, or anything after the main window is shown | One-time boot setup before the main window is shown (paths, `mkdirSync` of data/log dirs, opening log streams). |
| P2 | Child processes | `utilityProcess.fork` for Node services | `child_process.spawn` for external binaries (git, etc.). |
| P3 | Quit | Intercept `before-quit` once, stop children gracefully with a timeout, then `app.quit()` | None. |
| P4 | Single instance | `app.requestSingleInstanceLock()` when the app owns ports/DB files | Multi-window apps that intentionally run several instances. |
| B1 | Fuses | Flip fuses at package time: `runAsNode` off, `nodeOptions` off, `nodeCliInspect` off, `onlyLoadAppFromAsar` on, `embeddedAsarIntegrityValidation` on, `grantFileProtocolExtraPrivileges` off | `cookieEncryption` only on signed builds (needs Keychain on macOS) — see E3. |
| B2 | Upgrades | Stay on a supported major (latest 3); upgrade one major at a time using the breaking-changes doc | None. |
| B3 | Updates | `electron-updater` with signature verification where a certificate exists | Unsigned free-tier builds (E3). |
| F1 | Startup | Show a window ASAP (`show: false` + `ready-to-show`), defer update checks and heavy `require`s | — |

## DevDigest exceptions (already approved)

These deviate from the upstream checklist **on purpose**. Do not "fix" them, and
do not widen them.

- **E1 — Loopback HTTP.** The window loads `http://127.0.0.1:43100` (Next.js
  standalone in a `utilityProcess`) and calls the API on `:43101`. Allowed
  because both are app-owned and bound to `127.0.0.1` only. Still required:
  origin-exact checks (N3), never bind to `0.0.0.0`, and never load any other
  `http:` origin.
- **E2 — Code outside `app.asar`.** API + studio run from `resources/server`
  and `resources/web` (real files, `extraResources`). ASAR integrity therefore
  does **not** cover them — any fuse/integrity claim must say so. Don't move them
  into the asar without changing the `utilityProcess` entry paths.
- **E3 — Unsigned builds.** Windows: no certificate, `signAndEditExecutable:
  false`, no `publisherName` → electron-updater skips signature verification.
  macOS: ad-hoc `identity: "-"`, no hardened runtime, no notarization, no
  auto-install (manual download prompt). Consequences to respect: no
  `cookieEncryption` fuse, no `safeStorage` reliance on macOS, and macOS
  notifications may emit `failed` (Electron ≥ 42 uses `UNNotification`).
- **E4 — Hidden native menu.** `setMenuBarVisibility(false)` keeps the menu (and
  its accelerators) while the studio draws the title bar. Don't replace with
  `Menu.setApplicationMenu(null)` — it would drop copy/paste/devtools shortcuts.
- **E5 — Duplicated channel names.** The sandboxed preload can't `require`
  local files, so channel strings live in both `preload.ts` and `ipc.ts`. Keep
  them in sync; don't add a bundler just to share them.

## Severity when reviewing

- **CRITICAL** — a renderer or remote page can gain privileges or reach the OS:
  an S1 flag set to an unsafe value, any S2, S5, S6, I1, I2, N1–N3 violation; I4 missing or bypassable; I5 when an
  unvalidated value reaches `shell`, `fs`, `child_process`, or SQL; B1 fuses
  missing on a shipped build; a DB-owning child killed without graceful stop (P3).
- **WARNING** — real bug or hardening gap without a direct exploit path: S1 flags
  omitted (safe defaults, but implicit), partial
  N1 (no `will-redirect`), unhandled `failed`/`error` events, P1 in a hot path,
  B2 more than one major behind, S4 missing CSP.
- **SUGGESTION** — style or defense-in-depth: `as` cast on an IPC arg that is then
  fully narrowed field by field, update check before `ready-to-show`, subframe
  policy not stated.

A finding covered by an E-exception is not reported. A finding in another module
(e.g. CSP in `client/`) is reported as a cross-module note, not a desktop violation.

## Red flags — stop and re-read the rule file

- `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false`, `webSecurity: false`
- `contextBridge.exposeInMainWorld('x', ipcRenderer)` or any `(...args) => ipcRenderer.invoke(...args)`
- `url.startsWith(...)`, `url.includes(...)`, or a regex on a raw URL string for a security decision
- `shell.openExternal(somethingFromTheRenderer)` without parsing the protocol
- `ipcMain.handle` with no `senderFrame` check, or one that trusts `arg` shape
- `ipcRenderer.sendSync`, `@electron/remote`, `readFileSync`/`execSync` in a handler
- `proc.kill()` on the API child (PGlite loses writes — use `stop(api, true)`)
- `app.quit()` inside `before-quit` without a re-entry guard
- A new `BrowserWindow` without its own `webPreferences` block
- Raising the Electron major by more than one at a time

## Common mistakes

| Mistake | Fix |
|---------|-----|
| "It's our own UI, so the renderer is trusted" | The renderer runs npm code and can be navigated; treat it as hostile (I4, I5, N1). |
| Checking `senderFrame.url.startsWith(WEB_URL)` | `new URL(frame.url).origin === WEB_ORIGIN`; handle `senderFrame === null`. |
| Throwing rich errors from `ipcMain.handle` | Only `error.message` crosses IPC; return `{ ok: false, code }` for errors the UI must branch on. |
| Passing `BrowserWindow`, `process.env`, DOM nodes over IPC | Structured clone only — plain data. |
| Using renderer `clipboard` module | Removed in Electron 44; use `navigator.clipboard` or a narrow preload helper (async). |
| Adding `BrowserView` | Deprecated since 30; use `WebContentsView`. |
