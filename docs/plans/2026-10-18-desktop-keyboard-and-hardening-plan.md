# Desktop: hardening, menu commands, Show/Hide shortcut, keyboard layouts — Development Plan

Date: 2026-10-18 · Base: `origin/main` @ bf399fd · Status: **draft, not approved**

Three pieces of work for the desktop app and the studio:

| # | Piece | Modules | Why now |
|---|-------|---------|---------|
| A | Security hardening: permission handlers, fuses, CSP | desktop, client | Two CRITICAL gaps under our own `electron-best-practices` rules (S5, B1) |
| B | Native menu with commands + accelerators | desktop, client | Keyboard control of app-level actions, native on macOS |
| C | Global Show/Hide shortcut (opt-in) | desktop, client | Open DevDigest from anywhere, pairs with the tray |
| D | Shortcuts that work on any keyboard layout | client | `g`/`j`/`k`/`a`/`d` silently do nothing on Ukrainian/Russian layouts today |
| E | Settings → Keyboard: rebind / disable every shortcut, toggle commands | client, desktop | One command registry; users pick their own keys |

Skills the implementer must load: `electron-best-practices` (every desktop
file + `electron-builder.yml`), `react-best-practices` / `react-project-structure`
(client hooks and Settings UI), `next-best-practices` (CSP headers).

## Current state (what the analysis found)

Keyboard today lives only in the studio (renderer):

- `client/src/components/app-shell/hooks/useGlobalShortcuts.ts` — `Ctrl/⌘+K`
  palette, `?` help, `g` + letter to jump to a section.
- `FindingsPanel.tsx` — `j`/`k` next/previous finding, `a` accept, `d` dismiss.
- `ShortcutsHelp.tsx` + `SHORTCUTS` in `app-shell/nav.ts` — the cheat sheet.
- `desktop/src/menu.ts` — only role menus (File/Edit/View/Window/Help); the
  menu bar is hidden on Windows (E4) but its accelerators work: copy/paste,
  reload, devtools, zoom.

Gaps:

1. **Layouts.** All letter shortcuts compare `e.key` (`e.key === "g"`). With
   a Cyrillic layout active the same physical key yields `"п"`, so `g`
   navigation and `j`/`k`/`a`/`d` don't fire. `Ctrl+K` works by luck on some
   systems only.
2. **No app-level commands in the native menu.** On macOS there is no
   Settings… (`⌘,`), no back/forward, no section switching; on Windows the
   mouse back/forward buttons do nothing.
3. **Nothing works from outside the app** — no way to bring DevDigest up
   without the mouse.
4. **Security (own rule set, `.claude/skills/electron-best-practices`):**
   - **S5 (CRITICAL):** no `setPermissionRequestHandler` /
     `setPermissionCheckHandler` — Electron grants every permission
     (camera, mic, geolocation, notifications, clipboard…) to whatever the
     window loads.
   - **B1 (CRITICAL):** no fuses are flipped. `runAsNode` is on, so
     `ELECTRON_RUN_AS_NODE=1 DevDigest.exe evil.js` runs arbitrary Node with
     the app's identity (INSIGHTS already notes Emdash exporting it);
     `nodeOptions` / `--inspect` are honoured; ASAR integrity is not checked.
     `@electron/fuses` is already in the lockfile (electron-builder dep) and
     electron-builder 26 supports an `electronFuses` block.
   - **S4 (WARNING, cross-module):** the studio sends no Content-Security-Policy.

## Part A — Security hardening

### A1. Permission handlers (`desktop/src/permissions.ts`, new)

Called once in `boot()` before any window exists.

- `session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => …)`
  → allow only when `isOwnOrigin(details.requestingUrl)` **and** `permission`
  is in an allowlist; everything else `cb(false)` + one `log.warn` per
  (origin, permission).
- `setPermissionCheckHandler` with the same allowlist (sync checks such as
  `navigator.permissions.query` and clipboard reads go through this one).
- `setDevicePermissionHandler(() => false)` — no HID/serial/USB.
- **Allowlist (from what the studio actually uses):**
  `clipboard-sanitized-write` (copy buttons: `LiveLogStream`, `RunTraceDrawer`,
  `PromptBlock`, `RunLocallySection` call `navigator.clipboard.writeText`).
  Nothing else — OS notifications go through the bridge, not the Web
  Notification API; no media, no geolocation.
- Move the navigation guards from `createWindow()` into
  `app.on('web-contents-created')` so every webContents (devtools, future
  windows) gets `will-navigate` / `will-redirect` / `setWindowOpenHandler`
  (rule N1: "the safest place").

Verify: copy buttons still work in `pnpm start`; `navigator.geolocation`
from devtools is denied; `main.log` shows the denial once.

### A2. Fuses (`desktop/electron-builder.yml`)

```yaml
electronFuses:
  runAsNode: false
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false
  onlyLoadAppFromAsar: true
  enableEmbeddedAsarIntegrityValidation: true
  grantFileProtocolExtraPrivileges: false
  enableCookieEncryption: false   # E3: unsigned builds, no Keychain on macOS
```

Risks to check, because a wrong fuse = an app that doesn't start:
- `utilityProcess.fork` (API + studio) does **not** depend on `runAsNode` —
  confirm the children still start in a packaged build.
- `onlyLoadAppFromAsar` covers only the main app entry; `resources/server`
  and `resources/web` stay outside the asar (E2) and are not covered by
  integrity — say so in the README, don't claim more.
- `pnpm start` (unpackaged) is unaffected — fuses are flipped at package time.
- macOS ad-hoc signing must happen **after** flipping (electron-builder
  orders this itself; verify with the `release` workflow dry run on the
  branch, per INSIGHTS — not locally).

Verify: `npx @electron/fuses read --app release/win-unpacked/DevDigest.exe`
shows the values; `ELECTRON_RUN_AS_NODE=1 DevDigest.exe -e "console.log(1)"`
launches the app instead of printing `1`; full app boots, review runs.

### A3. CSP for the studio (`client/next.config.*`, cross-module)

Add a `headers()` entry for all routes:
`default-src 'self'; script-src 'self' 'unsafe-inline'` (Next's inline
bootstrap + our no-FOUC theme script) `; style-src 'self' 'unsafe-inline';
img-src 'self' data: https://avatars.githubusercontent.com;
connect-src 'self' <API origin>; frame-ancestors 'none'; object-src 'none'`.

- `connect-src` must include the API base (`NEXT_PUBLIC_API_BASE` —
  `http://127.0.0.1:43101` in desktop builds, `http://localhost:3001` in dev)
  and the SSE stream on it.
- **Never `'unsafe-eval'` in production** (S4); dev mode needs it for React
  refresh → only add it when `NODE_ENV !== 'production'`.
- Mermaid diagrams / markdown rendering: check they don't need `unsafe-eval`
  or blob workers — if they do, that's an open question, not a silent widening.

Verify: no CSP violations in the console across PR page, Skills, Agents,
Memory, Onboarding tour (mermaid), Settings; e2e suite green.

## Part B — Native menu with commands

### B1. Command bridge

- New push channel `app:command` (main → studio), buffered in the preload
  like `app:navigate` (`bufferedChannel`, see desktop INSIGHTS 2026-10-16).
  Payload is a command id from a fixed list — main never sends routes or
  free text.
- Bridge: `app.onCommand(cb: (id: DesktopCommand) => void): () => void`;
  type + fake bridge updated in `client/src/lib/desktop.ts` /
  `client/src/test/fake-desktop-bridge.ts`.
- Studio side: `useDesktopCommands()` in `app-shell/hooks/`, mounted in
  `AppShell` next to `useDesktopDeepLinks`. It maps ids to the **same
  handlers** the keyboard already uses (open palette, open help,
  `router.push(resolveHref(...))`) — no second implementation.

### B2. Menu content (`desktop/src/menu.ts`)

| Menu | Item | Accelerator | Action |
|---|---|---|---|
| App (macOS) / File | Settings… | `CmdOrCtrl+,` | `app:command settings` |
| Go | Command Palette | `CmdOrCtrl+K` **display only** (`registerAccelerator: false`) | `app:command palette` |
| Go | Pull Requests … CI Runs | `CmdOrCtrl+1` … `CmdOrCtrl+9` | `app:command go:<nav key>` (order = sidebar `NAV`) |
| Go | Back / Forward | `Alt+Left` / `Alt+Right` (Win/Linux), `Cmd+[` / `Cmd+]` (macOS) | `webContents.navigationHistory.goBack()/goForward()` in main |
| View | Zoom in/out/reset, Toggle Full Screen | role defaults | (already there via `viewMenu`) |
| Help | Keyboard Shortcuts | `CmdOrCtrl+/` | `app:command shortcuts-help` |
| Help | existing items | — | unchanged |

Rules that keep this from fighting the studio's own key handling:
- **One owner per shortcut.** A registered menu accelerator consumes the
  key before the page sees it. Shortcuts the studio already owns
  (`Ctrl+K`, `?`, `g x`, `j/k/a/d`) stay in the studio; the menu only
  *shows* `Ctrl+K` (`registerAccelerator: false`).
- `CmdOrCtrl+1..9` and `CmdOrCtrl+,` are new and owned by the menu.
- Single-letter shortcuts are never menu accelerators (they'd break typing).
- Windows mouse back/forward buttons: `BrowserWindow` `app-command`
  (`browser-backward` / `browser-forward`) → same goBack/goForward.
- The menu bar stays hidden on Windows (E4); Alt does not reveal it. The
  studio's cheat sheet (B3) is where Windows users discover these.

### B3. Cheat sheet

`SHORTCUTS` gains a **Desktop** group (rendered only when `useDesktop()` is
non-null): Settings, sections 1–9, back/forward, Show/Hide (with the
user's current binding, read from the bridge). Labels show `⌘` on macOS and
`Ctrl` elsewhere (today `⌘K` is shown everywhere — fix while here).

Channel/accelerator strings live in both `menu.ts` and `nav.ts`; same
accepted duplication as E5, with a comment pointing at the other file.

## Part C — Global Show/Hide shortcut

- `desktop/src/global-shortcut.ts`: `globalShortcut.register(accel, toggle)`
  after `ready`, `globalShortcut.unregisterAll()` on `will-quit`.
- **Opt-in, off by default.** A global shortcut steals the combo from every
  other app on the machine; turning it on is the user's call. Suggested
  binding in the UI: `CmdOrCtrl+Shift+D` (avoid `Ctrl+Alt+…` — AltGr on
  Ukrainian/Polish layouts).
- Toggle behaviour: window visible **and** focused → hide (to tray when
  close-to-tray is on, otherwise minimize); otherwise → existing
  `showWindow()` (restores from tray/minimized, focuses, flashFrame fallback).
- `register()` returns `false` when another app owns the combo → the
  setting shows "Taken by another app — pick a different one"; never retry
  silently.
- Prefs: `desktop-prefs.json` gains `globalShortcut: string | null`. Bridge
  `getPrefs()/setPrefs()` extended; main validates the accelerator string
  (allow-list grammar: 1+ of `CommandOrControl|Alt|Shift|Super` + one key;
  require a non-Shift modifier; max length) before registering.
- Settings UI: "Desktop app" block with an on/off switch and a
  **shortcut recorder** (focus the field, press the combo; renderer converts
  `KeyboardEvent` → Electron accelerator using `e.code`, so it's layout-
  independent; Esc cancels, Backspace clears). Lives in Settings → Keyboard
  as the `window.toggle` command (Part E); Settings → Desktop links to it.
- Linux/Wayland: global shortcuts are often unavailable → show the
  "couldn't register" message, don't crash.

## Part D — Shortcuts that work on any keyboard layout

- Letter shortcuts compare the **physical key** `e.code` (`KeyG`, `KeyJ`,
  `KeyK`, `KeyA`, `KeyD`) instead of `e.key`, in `useGlobalShortcuts.ts`
  and `FindingsPanel.tsx`. `Ctrl/⌘+K` → `e.code === "KeyK"`.
- `NAV` items get the code alongside the display letter (`gKey: "p"` →
  derive `Key${upper}`), so the cheat sheet keeps showing Latin letters.
- `?` keeps `e.key === "?"` (it's a character, placed differently per
  layout) **or** `e.code === "Slash" && e.shiftKey` for the US position.
- Ignore events with `e.isComposing` (IME) and keep the existing
  `isTextInput` guard.
- One small helper (`matchesKey(e, "KeyG")`) in `app-shell/helpers.ts`
  rather than repeating the comparison.

Tests: extend the shortcut hook tests and `FindingsPanel` tests with
`{ key: "п", code: "KeyG" }`-style events (Ukrainian layout) next to the
existing Latin ones.

## Order, commits, verification

```
D (layouts, client only) ──┐
A1 permissions ────────────┤
A2 fuses (packaged check) ─┤── independent
A3 CSP (client) ───────────┤
B1 → B2 → B3 (command bridge, menu, cheat sheet)
E1 registry → D layouts → E2 overrides → E3 Settings → Keyboard
C (global Show/Hide = an `os`-scope command; after B and E)
```

One commit per piece: `fix(ui): …layouts`, `fix(desktop): permission handlers`,
`build(desktop): flip electron fuses`, `feat(web): content security policy`,
`feat(desktop): native menu commands`, `feat(desktop): global show/hide shortcut`.

Verification beyond unit tests: `pnpm start` for A1/B/C; a packaged
Windows build + `release` dry run for A2 (fuses) — the only part that can
brick startup; e2e suite for A3 and D.

## Decisions (former open questions, resolved by common practice)

- **Q1 — where desktop-only settings live → two new sections.**
  Desktop apps that share a codebase with a web app (VS Code, Slack, Discord,
  Linear) keep shell-only options in their own section that the browser
  never shows, and give keyboard shortcuts a section of their own.
  - **Settings → Desktop** (rendered only when `useDesktop()` is non-null):
    close-to-tray (moved out of Notifications), later launch-at-login. The
    old Notifications row is removed; `/settings/desktop` in a browser falls
    back to the default section.
  - **Settings → Keyboard** (all platforms): every shortcut, rebindable —
    see Part E. The global Show/Hide shortcut is a row there, tagged
    "Global · desktop app"; the Desktop section links to it.
- **Q2 — `Ctrl+1…9` → by position in the sidebar.** Position-based
  numbering is the convention users already know (browser tabs, Slack
  workspaces, VS Code editor groups): predictable, discoverable from the
  sidebar itself, and it follows reordering without a second list.
  Ctrl+1–9 = the first nine sidebar entries (PRs … Multi-Agent); Agent
  Performance and CI Runs stay on `g f` / `g c` and the palette. Settings
  uses the platform convention `Ctrl/⌘+,`, not a number. Users who want a
  different set rebind them in Part E.
- **Q3 — CSP: no `unsafe-eval`; nonce for scripts.** Checked: mermaid 11
  (`mermaid.core.mjs`) contains no `eval` / `new Function`, and we already
  run it with `securityLevel: "strict"`; react-markdown doesn't evaluate
  code. Mermaid writes inline `<style>` into its SVG → `style-src
  'unsafe-inline'` stays (the S4 rule allows it). For scripts, Next's
  documented approach replaces `script-src 'unsafe-inline'` with a
  **per-request nonce set in `middleware.ts`** (Next applies it to its own
  inline scripts; our no-FOUC theme script gets `nonce` too). The cost —
  pages render dynamically — doesn't matter for a local app. Dev mode alone
  adds `'unsafe-eval'` for React refresh. If something breaks under the
  policy, it's fixed or reported, never covered by widening the policy.

## Part E — Settings → Keyboard: rebindable shortcuts

How mature apps do it (VS Code keybindings editor, JetBrains keymap,
Discord keybinds, Slack/GitHub "single-key shortcuts" switch), adapted to us.

### E1. One command registry (the source of truth)

Today shortcuts are spread over `useGlobalShortcuts`, `FindingsPanel`, the
sidebar's `Ctrl+B`, the palette's command list and the cheat sheet's
`SHORTCUTS`. Replace with a registry in `client/src/lib/keyboard/`:

```ts
interface CommandDef {
  id: string;                // "nav.go.pulls", "palette.open", "theme.toggle", "findings.next", "window.toggle"
  labelKey: string;          // i18n
  group: "global" | "navigation" | "findings" | "view" | "desktop";
  scope: "app" | "page:findings" | "os";   // where it can fire; "os" = globalShortcut, desktop only
  defaults: { win?: Binding; mac?: Binding; all?: Binding };  // null = unbound by default
  desktopOnly?: boolean;
  rebindable: boolean;       // false for Ctrl+C/V etc. shown for reference
}
```

- **Commands, not keys, are the unit** (VS Code model): the palette, the
  menu (Part B), the cheat sheet and the settings page all read the same
  list, so a rebound key shows up everywhere at once.
- A binding is stored as **physical keys** (`e.code` + modifiers,
  e.g. `Mod+Shift+KeyD`, `Mod` = ⌘ on macOS / Ctrl elsewhere), so it works on
  any layout (Part D); sequences are `KeyG KeyP`.
- **Toggles are commands too** — that's the "switch functionality" part:
  toggle theme, toggle sidebar, mute notification sound, (desktop) toggle
  close-to-tray, show/hide window. Each is just a command with a binding
  (unbound by default where there's no obvious key).
- One dispatcher hook replaces the ad-hoc `keydown` listeners: matches the
  event against the effective bindings, respects `scope`, the
  `isTextInput` guard and `e.isComposing`.

### E2. Storage: only the user's overrides

- Persist **overrides only** (`{ [commandId]: Binding | null }`, `null` =
  disabled), never the full table — new defaults in an update reach users
  who didn't touch that command.
- Where: the existing non-secret prefs (`PUT /settings`, key
  `keybindings`) — same as notification prefs, so it works in the browser
  and survives a cleared localStorage.
- Desktop: the studio pushes the `os` + menu-relevant bindings to main over
  the bridge (`app.setKeybindings`); main validates, registers, and caches
  them in `desktop-prefs.json` so the menu and the global shortcut are
  right **before** the studio has loaded.

### E3. The settings page

`/settings/keyboard`, section key `keyboard` added to `SETTINGS_SECTIONS`.

- **Table grouped by `group`**: command name · current binding (kbd chips,
  `⌘` on macOS / `Ctrl` elsewhere) · "Modified" badge · actions (edit, reset,
  disable).
- **Search** by command name, and a "record keys" search mode that finds the
  command bound to a pressed combo (VS Code's best-loved feature here).
- **Recorder**: click edit → field captures the next combo (`e.code` +
  modifiers, live preview), Enter/blur saves, Esc cancels, Backspace
  unbinds; for sequences, a second key within 1 s is appended.
- **Validation before saving**:
  - Conflicts in an overlapping scope → inline warning "Already used by
    *Go to Skills*" with **Replace** (unbinds the other) or **Cancel**.
  - Reserved combos refused with a reason: clipboard/undo/select-all,
    `Ctrl/⌘+W/Q/R`, `Alt+F4`, `F5`, `F12`, `Tab`, plain `Esc`.
  - Single keys without modifiers allowed only in `app`/`page` scope.
  - `os` scope (global): must include a non-Shift modifier; main tries to
    register and reports "taken by another app" (`globalShortcut.register`
    returns `false`) — the setting is not saved in that case.
- **Reset this / Reset all to defaults**.
- **"Single-key shortcuts" master switch** (on by default). WCAG 2.1.4
  (Character Key Shortcuts) requires single-letter shortcuts to be
  switchable off or remappable — screen-reader and speech-input users
  trigger them by accident. GitHub and Slack expose exactly this switch.
- The `?` cheat sheet and the palette show the **effective** bindings and
  link to this page ("Customize…").

### E4. Order and tests

E1 (registry + dispatcher, no behaviour change, existing tests stay green)
→ D (layouts fall out of `e.code` bindings) → E2 (overrides) → E3 (UI)
→ C (global Show/Hide becomes the `window.toggle` command with `os` scope).

Tests: registry/dispatcher unit tests (scope, text-input guard, sequences,
Cyrillic layout events), conflict/reserved-combo validation, settings page
RTL tests (record, conflict → replace, reset, disable single-key), bridge
contract for `setKeybindings` in the fake bridge.

Commits: `refactor(ui): keyboard command registry`, `feat(settings):
rebindable shortcuts`, `feat(settings): desktop section`.
