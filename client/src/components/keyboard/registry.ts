/* The command registry (SPEC-11 AC-1/AC-2): every keyboard-reachable action. */
import { NAV, SETTINGS_ITEM } from "@/components/app-shell/nav";
import type { Binding, CommandDef, Platform } from "./types";

const both = (b: Binding | null): Record<Platform, Binding | null> => ({ mac: b, other: b });

/** g-nav letter (or ",") → physical key code. */
function gCode(gKey: string): string {
  if (gKey === ",") return "Comma";
  return `Key${gKey.toUpperCase()}`;
}

/** Sidebar items in visual order — `Mod+1…9` follow this (Q2: by position). */
export const SIDEBAR_ITEMS = NAV.flatMap((g) => g.items);

export const COMMANDS: CommandDef[] = [
  // General
  { id: "palette.open", label: { key: "openPalette" }, group: "general", scope: "app", owner: "studio", defaults: both("Mod+KeyK"), rebindable: true },
  { id: "help.show", label: { key: "showHelp" }, group: "general", scope: "app", owner: "studio", defaults: both("Shift+Slash"), rebindable: true },
  { id: "sidebar.toggle", label: { key: "toggleSidebar" }, group: "general", scope: "app", owner: "studio", defaults: both("Mod+KeyB"), rebindable: true },
  { id: "theme.toggle", label: { key: "toggleTheme" }, group: "general", scope: "app", owner: "studio", defaults: both(null), rebindable: true },
  { id: "sound.toggle", label: { key: "toggleSound" }, group: "general", scope: "app", owner: "studio", defaults: both(null), rebindable: true },

  // Navigation: g then <letter>
  ...[...SIDEBAR_ITEMS, SETTINGS_ITEM]
    .filter((it) => it.gKey)
    .map(
      (it): CommandDef => ({
        id: `nav.${it.key}`,
        label: { key: "goTo", nav: it.key },
        group: "navigation",
        scope: "app",
        owner: "studio",
        defaults: both(`KeyG ${gCode(it.gKey!)}`),
        rebindable: true,
      }),
    ),

  // Findings (only while a findings list is mounted)
  { id: "findings.next", label: { key: "nextFinding" }, group: "findings", scope: "page:findings", owner: "studio", defaults: both("KeyJ"), rebindable: true },
  { id: "findings.prev", label: { key: "prevFinding" }, group: "findings", scope: "page:findings", owner: "studio", defaults: both("KeyK"), rebindable: true },
  { id: "findings.accept", label: { key: "acceptFinding" }, group: "findings", scope: "page:findings", owner: "studio", defaults: both("KeyA"), rebindable: true },
  { id: "findings.dismiss", label: { key: "dismissFinding" }, group: "findings", scope: "page:findings", owner: "studio", defaults: both("KeyD"), rebindable: true },

  // Desktop app: native menu accelerators, tray, global show/hide
  { id: "desktop.settings", label: { key: "openSettings" }, group: "desktop", scope: "app", owner: "menu", defaults: both("Mod+Comma"), rebindable: true, desktopOnly: true },
  ...Array.from(
    { length: 9 },
    (_, i): CommandDef => ({
      id: `desktop.section.${i + 1}`,
      label: { key: "goToSection", values: { n: i + 1 } },
      group: "desktop",
      scope: "app",
      owner: "menu",
      defaults: both(`Mod+Digit${i + 1}`),
      rebindable: true,
      desktopOnly: true,
    }),
  ),
  { id: "desktop.back", label: { key: "goBack" }, group: "desktop", scope: "app", owner: "menu", defaults: { mac: "Mod+BracketLeft", other: "Alt+ArrowLeft" }, rebindable: true, desktopOnly: true },
  { id: "desktop.forward", label: { key: "goForward" }, group: "desktop", scope: "app", owner: "menu", defaults: { mac: "Mod+BracketRight", other: "Alt+ArrowRight" }, rebindable: true, desktopOnly: true },
  { id: "desktop.trayToggle", label: { key: "toggleTray" }, group: "desktop", scope: "app", owner: "studio", defaults: both(null), rebindable: true, desktopOnly: true },
  { id: "window.toggle", label: { key: "toggleWindow" }, group: "desktop", scope: "os", owner: "os", defaults: both(null), rebindable: true, desktopOnly: true },
];

export const COMMAND_GROUPS = ["general", "navigation", "findings", "desktop"] as const;

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));

export function commandById(id: string): CommandDef | undefined {
  return BY_ID.get(id);
}

/** Commands that exist in this runtime (desktop-only ones are hidden in a browser — AC-9). */
export function visibleCommands(desktop: boolean): CommandDef[] {
  return COMMANDS.filter((c) => desktop || !c.desktopOnly);
}
