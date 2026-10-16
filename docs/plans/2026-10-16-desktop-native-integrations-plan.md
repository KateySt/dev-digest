# Desktop native integrations — Development Plan

Date: 2026-10-16 · Base: `origin/main` @ 3c6c7d8 · Status: **draft, not approved**

Seven Electron features for `desktop/`, plus the client/server pieces they need:

| # | Feature | Modules |
|---|---------|---------|
| F1 | Deep links `devdigest://` | desktop, client |
| F2 | Taskbar progress + unread badge | desktop, client, server |
| F3 | System tray + close-to-tray | desktop, client |
| F4 | Clickable notifications | desktop (small gap only) |
| F5 | `safeStorage` encryption of `secrets.json` | desktop, server |
| F9 | Native context menu (copy/paste, spellcheck, links) | desktop |
| F14 | Theme sync with the OS (`nativeTheme`) | desktop, client |

Skills the implementer must load: `electron-best-practices` (every desktop file),
`onion-architecture` + `fastify-best-practices` (F2 server endpoint),
`tanstack-query` (F2 client hook), `react-project-structure` (new client files).

## What already exists (don't rebuild)

- **F4 is ~90% done.** `desktop/src/ipc.ts` `showNotification` already opens the
  notification's `href` on click via `app:navigate`, and
  `client/src/components/notification-center/useDesktopNotifier.ts` routes it.
  Only gap: once F3 hides the window to the tray, the click must also `show()`
  a hidden window (it does call `win.show()` — verify it still works when the
  window is hidden, not minimized) and `focus()` on Windows may be blocked by
  foreground-lock; fall back to `win.flashFrame(true)`.
- Single-instance lock + `second-instance` handler (`desktop/src/main.ts`) —
  F1 extends it.
- Notification unread count: `useNotifications()` in
  `client/src/lib/hooks/notifications.ts` — F2's badge source.
- In-flight review runs: `agent_runs.status in ('queued','running')`
  (`server/src/modules/reviews/repository/run.repo.ts`, `IN_FLIGHT`); eval runs
  `status='running'` (`server/src/db/schema/eval.ts`); multi-agent `in_progress`.
- Theme: `client/src/lib/contexts/theme.tsx` — `data-theme` dark|light in
  localStorage, no-FOUC inline script. No "system" mode yet.
- `desktop/build/` (electron-builder `buildResources`) has **no icons** — the app
  ships Electron's default icon. F3 needs icon assets (see step 4).

## Step 0 — Hardening the boundary first (prerequisite for every step)

We are about to add IPC channels that drive OS features, so first fix the
existing **N3 violations** (electron-best-practices, CRITICAL):

- `ipc.ts` `ownWindow`: `e.senderFrame?.url.startsWith(WEB_URL)` →
  `new URL(frame.url).origin === WEB_ORIGIN` (handle `senderFrame === null`,
  `try/catch` the URL parse). Add `WEB_ORIGIN = new URL(WEB_URL).origin` to `config.ts`.
- `main.ts` `setWindowOpenHandler` / `will-navigate`: same origin compare; add
  `will-redirect` with the same handler; external URLs go through one
  `openExternalSafe(url)` helper (https only, parsed with `new URL`) — F9 reuses it.
- Add a tiny payload-validation helper module `desktop/src/validate.ts`
  (`isStudioRoute(v)`, `clampInt(v, min, max)`, `oneOf(v, values)`) so every
  new handler treats args as `unknown` (I5). Move the existing `href` regex
  from `showNotification` into `isStudioRoute`.

Done when: typecheck passes, existing title-bar controls + notifications still
work in `pnpm start`.

## Step 1 — F14 Theme sync

Two directions.

**Studio → native.** When the user picks dark/light, native surfaces (menus,
dialogs, context menu from F9, window background during resize) must match.
- Bridge: `app.setThemeSource(mode: 'dark' | 'light' | 'system')` →
  channel `app:set-theme-source` → `nativeTheme.themeSource = mode` and
  `win.setBackgroundColor(...)` (dark `#0a0a0a`, light = the light surface
  token from `globals.css`). Validate with `oneOf`.
- Persist the last value in main (see "desktop prefs" in step 4) so the next
  boot creates the window with the right `backgroundColor` (no white/black flash).

**OS → studio ("System" mode).**
- `theme.tsx`: add `"system"` to the *preference* (stored), keep the *resolved*
  `data-theme` attribute dark|light so `globals.css` doesn't change. Resolve via
  `matchMedia('(prefers-color-scheme: dark)')` and subscribe to its `change`
  event. Works in the browser too; in Electron `prefers-color-scheme` follows
  `nativeTheme` when `themeSource='system'`.
- Update `themeNoFlashScript` to resolve `system` before paint.
- `SettingsAppearance`: third option "System". Default stays `dark` (no
  behaviour change for existing users).
- Client calls `desktop?.app.setThemeSource(pref)` from `ThemeProvider` when the
  preference changes (null-safe — browser has no bridge).

Tests: `theme.tsx` unit test for system resolution + media-query change;
`SettingsAppearance.test.tsx` gets the new option.

## Step 2 — F9 Native context menu

Main only, new file `desktop/src/context-menu.ts`, attached in `createWindow`
via `webContents.on('context-menu', (e, params) => …)`.

- Editable fields (`params.isEditable`): Undo/Redo, Cut/Copy/Paste/Select all —
  enabled from `params.editFlags`.
- Text selection: Copy, plus "Search GitHub for “…”" (optional, https constant URL).
- Spellcheck: `params.dictionarySuggestions` → `webContents.replaceMisspelling`,
  "Add to dictionary" → `session.addWordToSpellCheckerDictionary`.
  Keep spellcheck on (Electron default); set languages to `['en-US']` +
  the OS locale on Windows/Linux (macOS uses the native checker).
- Links (`params.linkURL`): "Open in browser" (via `openExternalSafe`, only
  https), "Copy link address" (main-process `clipboard.writeText`).
- Images: "Copy image" (`webContents.copyImageAt`).
- Dev only (`!app.isPackaged`): "Inspect element".
- Labels: English (desktop has no i18n today; flag if the studio's i18n should
  drive them — out of scope for v1).

No IPC, no client changes. Manual check in `pnpm start`.

## Step 3 — Activity state (shared by F2 and F3)

The studio is the only place that knows what's running, so it pushes a small
state object to main; main renders it into the taskbar, badge and tray.

**Server — `GET /activity`** (new module `server/src/modules/activity/`,
routes → service → repository per onion-architecture):
```json
{ "reviews_running": 2, "evals_running": 0, "multi_agent_running": 1 }
```
Counts for the current workspace: `agent_runs` in `IN_FLIGHT` (reuse the
constant — export it rather than duplicating), eval runs `status='running'`,
multi-agent runs in progress. Response schema in `@devdigest/shared` contracts.
Repository test against the it-test DB.

**Client — `useActivity()`** in `client/src/lib/hooks/activity.ts`
(tanstack-query skill): `enabled` only when `useDesktop()` is non-null;
`refetchInterval` 3 s while any count > 0, 20 s idle. Also invalidate it when a
notification arrives on the stream (a finished review ⇒ count changed).

**Client — `<DesktopActivitySync />`** (renders nothing) mounted in
`client/src/lib/contexts/providers.tsx`: combines `useActivity()` + unread count
from `useNotifications()` and calls
`desktop.app.setActivity({ running, unread })` when either changes.

**Bridge** `app:set-activity` → main validates (`clampInt(0, 999)`) and calls
the F2 and F3 renderers.

## Step 4 — F3 Tray + close-to-tray

New `desktop/src/tray.ts`, created in `boot()` after `createWindow()`.

- **Icons** (new assets, committed to `desktop/build/`): `tray.png` +
  `tray@2x.png` (Windows/Linux), `trayTemplate.png` + `@2x` (macOS menu bar,
  monochrome). Also add the app icon (`icon.ico` / `icon.icns` / `icon.png`) —
  currently missing — so the taskbar/installer stop showing the Electron logo.
  Load via `join(process.resourcesPath, …)` when packaged → add
  `extraResources` entry for the tray images.
- **Menu**: status line (disabled item: "2 reviews running" / "Idle"),
  "Open DevDigest", separator, "Check for updates…", "Quit DevDigest".
  Rebuilt on every `setActivity`. Tooltip = same status text.
- **Click**: Windows/Linux left-click → show/focus window; macOS → menu.
- **Close-to-tray** (Windows/Linux only — macOS already keeps the app in the Dock):
  `mainWindow.on('close')` → if `prefs.closeToTray && !quitting` →
  `preventDefault()` + `hide()`. First time only: a notification
  "DevDigest is still running in the tray".
- **Quit paths must bypass close-to-tray**: tray Quit, `before-quit`, and
  **`autoUpdater.on('before-quit-for-update')`** — otherwise
  `quitAndInstall()` would just hide the window and the update never installs.
  Set the shared `quitting` flag in all of them (move `quitting` into a tiny
  `desktop/src/state.ts` so `updater.ts` and `tray.ts` can set it).
- **Desktop prefs** (new `desktop/src/prefs.ts`): `userData/desktop-prefs.json`
  `{ closeToTray: boolean (default true), themeSource }`. Sync read once in
  `boot()` before the window is shown (P1 exception), async writes afterwards.
  Bridge: `app.getDesktopPrefs()` / `app.setDesktopPrefs(partial)` (validated).
- **Client**: Settings → a "Desktop app" block (only rendered when
  `useDesktop()` is non-null) with the "Keep running in the tray when closed"
  toggle. Put it in the existing Notifications or a new Desktop section —
  decide with the settings layout owner (open question Q2).

## Step 5 — F2 Taskbar progress + badge

New `desktop/src/taskbar.ts`, fed by `setActivity`.

- **Progress**: `running > 0` → `win.setProgressBar(2)` (value > 1 =
  indeterminate on Windows; macOS shows a Dock progress bar) ; `0` →
  `setProgressBar(-1)`. We have no percentage across mixed jobs, so
  indeterminate is the honest choice.
- **Badge (unread notifications)**:
  - macOS: `app.dock.setBadge(unread ? String(unread) : '')`.
  - Linux: `app.setBadgeCount(unread)` (Unity/KDE only, harmless elsewhere).
  - Windows: `win.setOverlayIcon(dotImage, '3 unread')` — a pre-made red dot
    PNG in `desktop/build/` (no number: rendering digits needs canvas; a dot
    is enough and accessible via the description), `null` when 0.
- Tray icon (F3) can swap to a "busy" variant while running (optional).

## Step 6 — F4 Notifications (gap only)

- Verify click works when the window is hidden in the tray (step 4) and on
  Windows when foreground-lock blocks `focus()` → `flashFrame(true)` until focus.
- Keep the existing "only while unfocused" rule; a window hidden to the tray
  counts as unfocused (it does — `isFocused()` is false).
- Handle `toast.on('failed')` (macOS unsigned builds, E3) → log only.

## Step 7 — F1 Deep links `devdigest://`

**Registration**
- `electron-builder.yml`: `protocols: [{ name: DevDigest, schemes: [devdigest] }]`
  (NSIS writes the registry keys; macOS gets `CFBundleURLTypes`).
- Dev (`!app.isPackaged`): `app.setAsDefaultProtocolClient('devdigest',
  process.execPath, [resolve(process.argv[1])])`.

**Receiving** (new `desktop/src/deep-link.ts`)
- Windows/Linux: first launch → `process.argv`; running app →
  `second-instance` `argv` (already wired, extend it).
- macOS: `app.on('open-url')` — must be registered **before** `whenReady`.
- Boot takes seconds (API + PGlite + Next), so queue the link until the main
  window has finished loading, then deliver.

**Supported URLs** (everything else ignored + logged; the URL is untrusted input):
- `devdigest://open?path=/repos/…` → validated with `isStudioRoute`
  (max 512 chars) → existing `app:navigate` channel.
- `devdigest://pr?url=https://github.com/<owner>/<repo>/pull/<n>` → main validates
  the GitHub URL with a strict pattern, sends `app:open-pr` `{ owner, repo, number }`.
- **Never** starts a review, an LLM call or any write — navigation only.

**Client** — `useDeepLinks()` mounted next to `useDesktopNotifier`:
`onOpenPr` → find the repo in `useRepos()` by owner/name → `router.push(
\`/repos/${repo.id}/pulls/${number}\`)`; unknown repo → toast
"Add <owner>/<repo> first" with an action to the add-repo flow.

**Bridge**: `app.onOpenPr(cb)` listener (wrapped per I2, returns unsubscribe).

## Step 8 — F5 `safeStorage` for `secrets.json`

Today `server/src/adapters/secrets/local.ts` writes API keys + GitHub token as
plaintext JSON (mode 0600 — ignored on Windows).

**Design: envelope key.** `safeStorage` exists only in the Electron main
process, but secrets are used by the API child. So:
1. Main creates a random 32-byte data key once, stores it as
   `userData/secrets.key` = `safeStorage.encryptString(base64Key)`.
2. Main sends the key to the API child via `proc.postMessage({ type:
   'secrets-key', key })` right after `fork` — **not an env var**: the server
   spawns `git` with its env, and env is readable by other same-user tools.
3. `server/src/desktop.ts` waits (≤ 5 s) for that message before
   `buildApp`, then passes the key to `LocalSecretsProvider`.
4. `LocalSecretsProvider` gains an optional cipher: file format
   `{ "v": 2, "iv", "tag", "data" }` (AES-256-GCM, `node:crypto`). Reading a
   legacy plaintext file → use it and rewrite encrypted immediately (migration).
   No key → behaves exactly as today (web/dev/Postgres mode unchanged).

**Platforms** (E3): Windows only (DPAPI). macOS: ad-hoc signing changes the
code identity on every update, so Keychain access would break — skip, keep
plaintext. Linux: skip when `safeStorage.getSelectedStorageBackend() ===
'basic_text'`. When skipped, main sends `{ type: 'secrets-key', key: null }`.

**Failure modes**
- `secrets.key` can't be decrypted (profile reset, copied data dir) → move
  `secrets.json` to `secrets.json.unreadable-<ts>`, start empty, log a warning;
  the studio already shows "key missing" states in Settings.
- Never log the key or decrypted values.

**Threat model, stated honestly in the README**: protects against another OS
user and an offline copy of the data dir; does **not** protect against malware
running as the same user.

Tests: server unit tests for the cipher round-trip, legacy migration, wrong key
→ empty + backup. Desktop: manual check that `secrets.json` is no longer
readable and keys survive restart + auto-update.

## Bridge changes summary (preload.ts ↔ ipc.ts ↔ client `lib/desktop.ts` ↔ `test/fake-desktop-bridge.ts`)

| Bridge method | Channel | Step |
|---|---|---|
| `app.setThemeSource(mode)` | `app:set-theme-source` | 1 |
| `app.setActivity({ running, unread })` | `app:set-activity` | 3 |
| `app.getDesktopPrefs()` / `app.setDesktopPrefs(p)` | `app:get-prefs` / `app:set-prefs` | 4 |
| `app.onOpenPr(cb)` | `app:open-pr` (main → renderer) | 7 |

Channel strings are duplicated in `preload.ts` and `ipc.ts` on purpose (E5).
Every new method must also land in `DesktopBridge` and the fake bridge.

## Order & parallelism

```
Step 0 ─┬─ Step 1 (F14) ─────────────┐
        ├─ Step 2 (F9) ──────────────┤
        ├─ Step 3 (activity) ─┬─ Step 4 (F3) ─ Step 6 (F4 gap)
        │                     └─ Step 5 (F2)
        ├─ Step 7 (F1)
        └─ Step 8 (F5)
```
All steps touch `preload.ts` / `ipc.ts` / `lib/desktop.ts`, so parallel
implementers would conflict on those files — recommended: **one implementer,
sequential**, one commit per step (`feat(desktop): …`, `feat(activity): …`,
`feat(secrets): …`).

## Verification

- `desktop`: `pnpm exec tsc --noEmit -p tsconfig.json`; manual run with
  `pnpm start` per step (no desktop test suite exists).
- `client`: `pnpm exec vitest run` for theme, settings, hooks, deep-link hook.
- `server`: unit tests for secrets cipher; it-test for `/activity` (needs Docker).
- Packaged check on Windows (`pnpm dist`): protocol registration, tray icon
  path, close-to-tray + auto-update install, encrypted `secrets.json`.
- `architecture-reviewer` on the diff (Electron rules + onion for `/activity`).

## Open questions

- **Q1** Deep link source: who produces `devdigest://pr?url=…` links? (a
  bookmarklet / GitHub PR comment from CI / a future browser extension). v1
  only ships the receiver.
- **Q2** Where the "Keep running in tray" toggle lives in Settings.
- **Q3** Should native labels (context menu, tray) follow the studio's i18n?
  v1: English only.
- **Q4** Close-to-tray default `true` or `false`? Plan assumes `true` +
  one-time explanatory notification.
