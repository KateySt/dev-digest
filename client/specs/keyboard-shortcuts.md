# Spec: Keyboard control — command registry, rebindable shortcuts, desktop menu and global Show/Hide

Spec ID: SPEC-11
Status: implemented (desktop D-1 – D-9 not yet verified in a running Electron build)
Supersedes: none

Plan this spec was written from:
[`../../docs/plans/2026-10-18-desktop-keyboard-and-hardening-plan.md`](../../docs/plans/2026-10-18-desktop-keyboard-and-hardening-plan.md)
(Parts B–E and the "Decisions" section). The plan's Part A (permission
handlers, fuses, CSP) is security hardening with no user-facing behavior and
is **not** specified here.

This is a client spec with a desktop counterpart. `desktop/` has no `specs/`
folder; its obligations are stated under *Module interactions* and carry
`D-` prefixed ids (D-1 …) so the plan-verifier can trace them. No server
change is required (see *Inputs and provenance*).

## Changelog

- 2026-10-18 — during implementation: D-1 Help → Keyboard Shortcuts shows
  the studio's `?` (display-only) instead of a separate `CmdOrCtrl+/`; D-2
  back/forward run in the studio (router history) instead of
  `navigationHistory` in main, so one code path serves menu, keys and mouse
  buttons; `app:set-keybindings` also carries translated menu `labels`.
- 2026-10-18 — initial version

## Problem and user

DevDigest is used by developers who live on the keyboard. Today:

- Shortcuts exist only inside the studio and are scattered over five places
  (`useGlobalShortcuts`, `FindingsPanel`, the sidebar's `Ctrl+B`, the
  command palette's list, the `?` cheat sheet's `SHORTCUTS`), each with its
  own matching code.
- Letter shortcuts compare the typed character (`e.key === "g"`), so with a
  Ukrainian or Russian layout active (`"п"`) `g`-navigation and the findings
  keys `j`/`k`/`a`/`d` silently do nothing.
- Nothing can be rebound or switched off. Single-letter shortcuts can't be
  disabled, which fails WCAG 2.1.4 (Character Key Shortcuts) for
  speech-input and screen-reader users.
- The desktop app adds no app-level commands of its own: no Settings
  (`⌘,`/`Ctrl+,`), no back/forward, no section switching by number, the
  mouse back/forward buttons do nothing, and there is no way to bring the
  window up from another application.
- The one desktop-only setting (close-to-tray) sits in Settings →
  Notifications, where it doesn't belong.

## Goals / Non-goals

Goals:

- One **command registry**: every keyboard-reachable action is a command
  with an id, a label, a scope and a default binding; the palette, the
  cheat sheet, the desktop menu and the settings page all read it.
- Shortcuts match **physical keys**, so they work on any keyboard layout.
- **Settings → Keyboard**: view, search, rebind, disable and reset every
  rebindable command, with conflict and reserved-combo checks, and a master
  switch for single-key shortcuts.
- **Toggle commands** (theme, sidebar, notification sound, close-to-tray,
  show/hide window) bindable like any other command.
- **Settings → Desktop** (desktop app only) for shell settings.
- Desktop: native menu with app-level commands and accelerators, mouse
  back/forward, and an opt-in **global Show/Hide** shortcut.

Non-goals:

- Security hardening (plan Part A) — separate work, separate commit set.
- Per-page shortcut sets beyond today's findings keys (e.g. diff view
  navigation) — the registry makes them cheap to add later.
- Import/export of keybindings, keymap presets (VS Code / JetBrains style).
- Rebinding multi-key sequences by recording both keys in one gesture beyond
  what AC-27 specifies; chords longer than two keys.
- A native (OS) keyboard-shortcuts UI; everything is in the studio.
- Localizing native menu labels (they stay English, as today).
- Server-side validation of the stored keybindings (client validates on
  read; see *Untrusted inputs*).

## User stories

- As a reviewer on a Ukrainian layout, I press `g` `p` and land on Pull
  Requests without switching layouts.
- As a keyboard user, I open Settings → Keyboard, find "Go to Skills",
  press `Ctrl+Shift+S`, and from then on that combo opens Skills — and the
  palette and the `?` sheet show it.
- As a user who keeps triggering `a` by accident with voice control, I turn
  off single-key shortcuts in one switch.
- As a desktop user, I bind `Ctrl+Shift+D` globally and bring DevDigest up
  from my editor; pressing it again hides it to the tray.
- As a macOS user, `⌘,` opens Settings and `⌘1` opens Pull Requests, like in
  my other apps.

## Acceptance criteria (EARS)

### Command registry and dispatch

- AC-1: The system shall define every keyboard-reachable action as a
  command with a stable id, an i18n label, a group, a scope (`app`,
  `page:findings`, or `os`), a default binding per platform (or none), a
  `rebindable` flag and a `desktopOnly` flag. (verify via: unit test)
- AC-2: The system shall register, as commands with today's default
  bindings, at least: open command palette (`Mod+K`), show shortcuts
  (`?`), go to each sidebar section (`g` + its current letter), go to
  Settings (`g ,`), next/previous finding (`j`/`k`), accept finding (`a`),
  dismiss finding (`d`), toggle sidebar (`Mod+B`), and toggle theme
  (unbound). (verify via: unit test)
- AC-3: WHEN a keydown event matches the effective binding of a command
  whose scope is active, the system shall run that command exactly once and
  shall prevent the event's default action. (verify via: unit test)
- AC-4: WHILE focus is in a text input, textarea, select, or
  contenteditable element, the system shall not run any command bound to a
  key without `Mod`/`Ctrl`/`Alt`. (verify via: unit test)
- AC-5: WHEN a keydown event has `isComposing` set, the system shall not run
  any command. (verify via: unit test)
- AC-6: The system shall run `page:findings` commands only while the
  findings list of a PR page is mounted. (verify via: unit test)
- AC-7: The command palette shall list registry commands with their
  effective binding next to the label, and shall show no binding for an
  unbound or disabled command. (verify via: unit test)
- AC-8: The `?` cheat sheet shall render, grouped, every command with an
  effective binding, show `⌘`/`⌥` on macOS and `Ctrl`/`Alt` elsewhere, and
  include a link to Settings → Keyboard. (verify via: unit test)
- AC-9: WHERE the studio runs in a browser, the system shall hide
  `desktopOnly` commands from the palette, the cheat sheet and Settings →
  Keyboard. (verify via: unit test)

### Keyboard layouts

- AC-10: The system shall match letter and digit keys by physical key
  (`KeyboardEvent.code`) and not by produced character, so that a binding
  fires identically with Latin and Cyrillic layouts active. (verify via:
  unit test with `{ key: "п", code: "KeyG" }` events)
- AC-11: The system shall match the `?` binding when the produced character
  is `?` on any layout, or when `Shift` + the `Slash` physical key is
  pressed. (verify via: unit test)
- AC-12: The system shall display bindings by the US-layout label of the
  physical key (e.g. `G`, `/`), regardless of the active layout. (verify
  via: unit test)

### Stored overrides

- AC-13: The system shall persist only user overrides — a map from command
  id to a binding or to `null` (disabled) — under the non-secret setting
  key `keybindings`, and never the full default table. (verify via: unit
  test)
- AC-14: WHEN the stored overrides are read, the system shall ignore, per
  entry, any unknown command id, any non-rebindable command, and any binding
  that fails validation (AC-30 – AC-33), and shall apply the remaining
  entries. (verify via: unit test)
- AC-15: The effective binding of a command shall be its override when one
  exists, else its platform default. (verify via: unit test)
- AC-16: WHEN a new version changes a command's default binding, users
  without an override for that command shall get the new default. (verify
  via: unit test)

### Settings → Keyboard page

- AC-17: The system shall add a Settings section `keyboard` at
  `/settings/keyboard`, after Appearance in the sub-navigation, available in
  the browser and the desktop app. (verify via: unit test)
- AC-18: The page shall list commands grouped by group, each row showing the
  label, the effective binding, a "Modified" marker when an override exists,
  and edit, reset and disable controls; non-rebindable commands show their
  binding read-only. (verify via: unit test)
- AC-19: WHEN text is typed into the page's search field, the system shall
  show only commands whose label contains it (case-insensitive). (verify
  via: unit test)
- AC-20: WHILE "search by keys" mode is on, WHEN a key combination is
  pressed, the system shall show only commands whose effective binding is
  that combination. (verify via: unit test)
- AC-21: WHEN edit is activated on a row, the system shall enter recording
  mode on that row, announce it to assistive technology, and show the
  combination being pressed as it is pressed. (verify via: unit test)
- AC-22: WHILE recording, WHEN `Esc` is pressed, the system shall leave
  recording mode without changes. (verify via: unit test)
- AC-23: WHILE recording, WHEN `Backspace` is pressed with no modifier, the
  system shall store an override of `null` (disabled) for that command.
  (verify via: unit test)
- AC-24: WHILE recording, WHEN a valid, non-conflicting combination is
  completed, the system shall store it as that command's override and show
  it on the row. (verify via: unit test)
- AC-25: WHEN reset is activated on a row, the system shall delete that
  command's override. (verify via: unit test)
- AC-26: WHEN "Reset all" is confirmed, the system shall delete every
  override. (verify via: unit test)
- AC-27: WHERE a command's default binding is a two-key sequence, WHILE
  recording, WHEN a second key without modifiers is pressed within 1 s of a
  first key without modifiers, the system shall record the pair as a
  sequence. (verify via: unit test)
- AC-28: The page shall be fully operable by keyboard, and every control
  shall have an accessible name. (verify via: unit test)
- AC-29: WHEN an override is saved, reset or cleared, the palette, the
  cheat sheet and the dispatcher shall use the new effective binding without
  a reload. (verify via: unit test)

### Validation, conflicts and reserved combinations

- AC-30: IF a recorded combination is reserved — `Mod+C`, `Mod+V`, `Mod+X`,
  `Mod+Z`, `Mod+Shift+Z`, `Mod+Y`, `Mod+A`, `Mod+W`, `Mod+Q`, `Mod+R`,
  `Mod+Shift+R`, `Alt+F4`, `F5`, `F11`, `F12`, `Tab`, `Shift+Tab`, `Esc`,
  `Enter`, or a bare modifier — THEN the system shall not save it and shall
  show the reason on the row. (verify via: unit test)
- AC-31: IF a combination without `Mod`/`Ctrl`/`Alt` is recorded for an
  `os`-scope command, THEN the system shall not save it and shall show that
  global shortcuts need a modifier other than Shift. (verify via: unit test)
- AC-32: IF a recorded combination equals the effective binding of another
  command whose scope can be active at the same time, THEN the system shall
  show "Already used by <command>" with Replace and Cancel actions and shall
  save nothing until one is chosen. (verify via: unit test)
- AC-33: WHEN Replace is chosen in AC-32, the system shall save the new
  binding and store `null` for the other command, in one settings update.
  (verify via: unit test)

### Single-key shortcuts switch

- AC-34: The page shall include a "Single-key shortcuts" switch, on by
  default, persisted with the overrides. (verify via: unit test)
- AC-35: WHILE the switch is off, the system shall not run any command whose
  effective binding has no `Mod`/`Ctrl`/`Alt` (including sequences), and the
  cheat sheet and palette shall show those bindings as off. (verify via:
  unit test)

### Toggle commands

- AC-36: The system shall provide commands, unbound by default, that toggle
  the theme between dark and light, toggle the sidebar, and toggle the
  notification sound preference. (verify via: unit test)
- AC-37: WHERE the studio runs in the desktop app, the system shall provide
  commands, unbound by default, that toggle close-to-tray and show/hide the
  window. (verify via: unit test)
- AC-38: WHEN a toggle command runs, the system shall apply the change
  through the same code path as the matching control in Settings and shall
  confirm it with a short toast naming the new state. (verify via: unit
  test)

### Settings → Desktop section

- AC-39: WHERE the studio runs in the desktop app, the system shall show a
  Settings section `desktop`; in a browser the section shall not appear in
  the sub-navigation and `/settings/desktop` shall render the default
  section. (verify via: unit test)
- AC-40: The Desktop section shall contain the close-to-tray switch (hidden
  on macOS, as today) and shall show the current global Show/Hide binding
  with a link to its row in Settings → Keyboard. (verify via: unit test)
- AC-41: The system shall remove the close-to-tray row from Settings →
  Notifications. (verify via: unit test)

### Desktop menu commands (studio side)

- AC-42: WHERE the studio runs in the desktop app, WHEN the desktop sends a
  menu command id, the system shall run the registry command with that id;
  unknown ids shall be ignored. (verify via: unit test with the fake bridge)
- AC-43: The system shall register, desktop-only, the commands go to
  Settings (`Mod+,`), go to sidebar section N for N = 1…9 by sidebar
  position (`Mod+1` … `Mod+9`), and go back / go forward. (verify via: unit
  test)

### Global Show/Hide (studio side)

- AC-44: The show/hide window command shall have scope `os`, be unbound by
  default, and be shown in Settings → Keyboard tagged "Global · desktop
  app". (verify via: unit test)
- AC-45: WHEN an `os`-scope binding is recorded, the system shall ask the
  desktop to register it and shall save it only if registration succeeds;
  IF it fails, THEN the system shall keep the previous binding and show
  "Taken by another app — pick a different combination". (verify via: unit
  test with the fake bridge)

## Edge cases

- **Stored value is not an object / is huge / has junk ids** (hand-edited
  DB, older build): AC-14 drops bad entries; a value larger than 16 KB is
  ignored entirely and logged once to the console.
- **Two commands collide through stored data** (e.g. a new default now
  equals an old user override): the user's override wins; the default-bound
  command shows a conflict marker on its row until resolved. The dispatcher
  runs the override owner only.
- **Override saved while another studio window is open** (browser tab +
  desktop): the other window picks it up on its next settings refetch; no
  live sync required.
- **macOS vs Windows defaults**: `Mod` resolves to `⌘` on macOS, `Ctrl`
  elsewhere; an override recorded on one platform with `Mod` stays portable.
  An override recorded with literal `Ctrl` on macOS stays `Ctrl`.
- **`Mod+1…9` with fewer sidebar entries** (e.g. no repo selected → repo
  sections hidden): numbers map to the *visible* entries; a number beyond
  the list does nothing.
- **Sequence started, then a modifier combo pressed**: the pending sequence
  is cancelled; the combo is matched on its own.
- **Recording on a layout that produces dead keys or AltGr characters**:
  matching uses `code`; `AltGr` (reported as `Ctrl+Alt` on Windows) is not
  accepted as part of a recorded combo — the row explains it.
- **Global binding registered, then the user disables the command**: the
  desktop unregisters it immediately (D-6).
- **Global registration succeeded at save time but fails on next launch**
  (another app grabbed it meanwhile): the Desktop section and the Keyboard
  row show "Not active — taken by another app"; the binding stays stored.
- **Linux / Wayland**: global shortcuts may be unsupported; registration
  fails cleanly and AC-45's message is shown.
- **Menu accelerator vs studio handler**: a key owned by the studio is only
  displayed in the menu (D-3), so the studio still receives it.

## Non-functional requirements

- **Latency**: dispatch adds no perceptible delay — matching is a map
  lookup per keydown, no allocation of the binding table per event.
- **No regressions**: every shortcut that works today keeps its default
  binding and behavior with a Latin layout; existing shortcut tests stay
  green after the registry refactor (plan step E1 ships with no behavior
  change).
- **Accessibility**: WCAG 2.1.4 satisfied by AC-34/AC-35; recording mode is
  announced (AC-21); the page works without a mouse (AC-28).
- **Portability**: the same stored overrides work in the browser and the
  desktop app; desktop-only commands are inert in the browser.
- **Size**: the `keybindings` setting stays under 16 KB.

## Inputs and provenance

- [reused: `GET`/`PUT /settings`] The `keybindings` value — `{ version: 1,
  singleKey: boolean, overrides: { [commandId]: Binding | null } }` — stored
  as a passthrough extra key (the `Settings` contract is
  `SettingsKnown.passthrough()`), like `desktop_notifications` today. No
  server or shared-contract change.
- [reused: `GET`/`PUT /settings`] `notification_sound` and the theme
  preference, written by the toggle commands through their existing paths.
- [reused: desktop bridge `getPrefs`/`setPrefs`] `closeToTray`.
- [new: desktop bridge] `onCommand`, `setKeybindings`
  (see *Module interactions*).
- [deterministic: client] Command registry, default bindings, reserved list,
  platform resolution of `Mod`, display labels.
- [new: 0 LLM calls] No surface in this spec makes or triggers an LLM call.

## Untrusted inputs

- **The stored `keybindings` value** is user data written by any studio
  window and stored unvalidated server-side (passthrough). The client
  validates it on every read (AC-14, size cap), never `eval`s or
  interpolates it into markup, and renders labels only from the registry,
  never from stored text.
- **Recorded key events** are reduced to `{ code, modifiers }` from a
  closed set before storing; free text never enters a binding.
- **Command ids from the desktop** (`app:command`) are matched against the
  registry; anything else is ignored (AC-42).
- **Accelerators sent to the desktop** are re-validated in main against a
  closed grammar before registration (D-5); the renderer is untrusted there
  per the `electron-best-practices` rules.

## Module interactions / API contracts

**client → server**: none new (see *Inputs and provenance*).

**client ↔ desktop bridge** (`client/src/lib/desktop.ts`,
`client/src/test/fake-desktop-bridge.ts`, `desktop/src/preload.ts`,
`desktop/src/ipc.ts` — channel names duplicated per E5):

| Bridge method | Channel | Direction | Payload |
|---|---|---|---|
| `app.onCommand(cb)` | `app:command` | main → studio, buffered in preload | command id (string) |
| `app.setKeybindings(b)` | `app:set-keybindings` | studio → main | `{ menu, global, display: { [id]: Binding \| null }, labels: { [id]: string } }` → `{ global: { [id]: "ok" \| "taken" \| "invalid" } }` |

Desktop obligations (`desktop/`, traced as D-N):

- D-1: The application menu shall include: Settings… (`CmdOrCtrl+,`), a Go
  menu with Command Palette, sections 1–9 (`CmdOrCtrl+1…9`), Back and
  Forward (`Alt+Left`/`Alt+Right` on Windows/Linux, `Cmd+[`/`Cmd+]` on
  macOS), and Help → Keyboard Shortcuts (showing the studio-owned `?`,
  display-only per D-3); menu items send `app:command` with the registry
  id. (verify via: manual check)
- D-2: Back/Forward shall send `app:command desktop.back` / `desktop.forward`,
  which the studio runs as client-side history navigation; Windows
  `app-command` events `browser-backward` / `browser-forward` (mouse side
  buttons) shall send the same commands. (verify via: manual check)
- D-3: WHERE a command's key is owned by the studio (palette, `?`, sequences,
  findings keys), its menu item shall display the accelerator with
  `registerAccelerator: false`. (verify via: manual check)
- D-4: WHEN `app:set-keybindings` is received, main shall rebuild the menu
  with the effective menu accelerators and (re)register `os`-scope bindings
  with `globalShortcut`, returning per-id status. (verify via: manual check)
- D-5: Main shall accept an accelerator only if it matches the closed
  grammar (modifiers from `CommandOrControl|Control|Command|Alt|Shift|Super`,
  one key from letters, digits, F1–F24, punctuation, arrows), has at most 4
  parts, and — for global bindings — includes a non-Shift modifier;
  otherwise it returns `invalid` and registers nothing. (verify via: manual
  check)
- D-6: WHEN a global binding is changed or disabled, main shall unregister
  the previous accelerator before registering the new one; on `will-quit`
  it shall unregister all. (verify via: manual check)
- D-7: The show/hide command shall hide the window when it is visible and
  focused (to the tray when close-to-tray is on, else minimize), and
  otherwise show, restore and focus it via the existing `showWindow()`.
  (verify via: manual check)
- D-8: Main shall cache the last accepted bindings in `desktop-prefs.json`
  and apply them at boot, before the studio has loaded. (verify via: manual
  check)
- D-9: The cached prefs shall be re-validated on load like any IPC input;
  invalid entries are dropped. (verify via: manual check)

## Design decisions

- **Commands, not keys, are the unit** (VS Code model) — one list feeds
  palette, cheat sheet, menu and settings, so a rebind shows up everywhere.
- **Physical keys (`code`)** — the only way bindings survive layout
  switching; display uses US labels, as VS Code and JetBrains do.
- **Overrides only** — defaults can evolve; users who customized keep their
  choice (AC-13/AC-16).
- **Store in `/settings`, cache in desktop prefs** — one source of truth that
  works in the browser; the desktop cache exists only so the menu and global
  shortcut work before the studio loads.
- **Global shortcut off by default** — it steals the combo from every other
  application; enabling it is the user's decision.
- **`Mod+1…9` by sidebar position** — the convention users know from
  browsers and Slack; follows reordering for free; rebindable.
- **Settings → Desktop + Settings → Keyboard** — shell-only options in a
  section the browser never shows (VS Code, Slack, Discord do the same);
  shortcuts get their own section on every platform.
- **Single-key switch** — WCAG 2.1.4; GitHub and Slack ship the same switch.

## Open questions

- None blocking. Possible follow-ups: keymap import/export; a "Keyboard"
  hint on hover tooltips across the app; per-page shortcuts for the diff
  view.
