/* Keyboard command registry types (SPEC-11). */

export type Platform = "mac" | "other";

/**
 * A binding in canonical form: one or two chords separated by a space
 * (a two-key sequence such as `KeyG KeyP`). A chord is its modifiers in the
 * fixed order Mod, Ctrl, Alt, Shift, followed by a `KeyboardEvent.code`,
 * joined with "+" — e.g. `Mod+Shift+KeyD`. `Mod` is ⌘ on macOS and Ctrl
 * elsewhere, so a binding recorded on one platform works on the other.
 * Physical codes (not characters) make bindings layout-independent.
 */
export type Binding = string;

/** Where a command can fire: anywhere in the app, only while a findings
 *  list is mounted, or system-wide (desktop global shortcut). */
export type CommandScope = "app" | "page:findings" | "os";

/** Who receives the key: the studio's keydown dispatcher, the desktop's
 *  native menu (accelerator), or the OS (global shortcut). */
export type CommandOwner = "studio" | "menu" | "os";

export type CommandGroup = "general" | "navigation" | "findings" | "desktop";

export interface CommandLabel {
  /** Key under `shell.keyboard.commands`, or "goTo" with `nav`. */
  key: string;
  /** Sidebar nav key for "Go to …" labels (`shell.nav.<nav>`). */
  nav?: string;
  /** ICU values, e.g. the section number. */
  values?: Record<string, string | number>;
}

export interface CommandDef {
  id: string;
  label: CommandLabel;
  group: CommandGroup;
  scope: CommandScope;
  owner: CommandOwner;
  defaults: Record<Platform, Binding | null>;
  rebindable: boolean;
  /** Only exists inside the desktop app (hidden in a browser). */
  desktopOnly?: boolean;
}

/** User overrides: command id → binding, or null = disabled. */
export type Overrides = Record<string, Binding | null>;

/** The `keybindings` value stored in non-secret settings. */
export interface StoredKeybindings {
  version: 1;
  singleKey: boolean;
  overrides: Overrides;
}
