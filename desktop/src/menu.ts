import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { RELEASES_URL, dataPaths } from './config';
import { checkForUpdates } from './updater';
import { toAccelerator, type Bindings } from './keybindings';

/** Sends a keyboard-registry command id to the studio window (`app:command`). */
export type CommandSender = (id: string) => void;

/**
 * Application menu. Besides the role menus (whose accelerators — copy/paste,
 * reload, zoom, devtools — keep working with the menu bar hidden, E4) it
 * carries the app-level commands of SPEC-11 D-1: Settings…, a Go menu
 * (palette, back/forward, sidebar sections 1–9) and Help → Keyboard
 * Shortcuts. Items send the command id to the studio, which runs it. Keys
 * the studio itself owns (palette, `?`) are display-only (D-3), so the menu
 * never swallows them. Rebuilt whenever the studio sends new bindings.
 */
export function buildMenu(bindings: Bindings, send: CommandSender): void {
  const isMac = process.platform === 'darwin';

  const command = (id: string, label: string, binding: string | null, displayOnly = false): MenuItemConstructorOptions => {
    const accelerator = binding ? toAccelerator(binding, displayOnly) : null;
    return {
      label: bindings.labels[id] ?? label,
      ...(accelerator && { accelerator }),
      ...(accelerator && displayOnly && { registerAccelerator: false }),
      click: () => send(id),
    };
  };
  const menuCmd = (id: string, label: string) => command(id, label, bindings.menu[id] ?? null);
  const settings = menuCmd('desktop.settings', 'Settings…');

  const go: MenuItemConstructorOptions[] = [
    command('palette.open', 'Command Palette', bindings.display['palette.open'] ?? null, true),
    { type: 'separator' },
    menuCmd('desktop.back', 'Back'),
    menuCmd('desktop.forward', 'Forward'),
    { type: 'separator' },
    ...Array.from({ length: 9 }, (_, i) => menuCmd(`desktop.section.${i + 1}`, `Section ${i + 1}`)),
  ];

  const help: MenuItemConstructorOptions[] = [
    command('help.show', 'Keyboard Shortcuts', bindings.display['help.show'] ?? null, true),
    { type: 'separator' },
    { label: 'Check for Updates…', click: () => void checkForUpdates(true) },
    { label: 'Releases', click: () => void shell.openExternal(RELEASES_URL) },
    { type: 'separator' },
    { label: 'Open Logs Folder', click: () => void shell.openPath(dataPaths().logs) },
    { label: 'Open Data Folder', click: () => void shell.openPath(dataPaths().userData) },
  ];

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      settings,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };
  const fileMenu: MenuItemConstructorOptions = isMac
    ? { role: 'fileMenu' }
    : { label: 'File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { label: 'Go', submenu: go },
    { role: 'windowMenu' },
    { role: 'help', submenu: [...help, ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'about' } as const])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({ applicationName: 'DevDigest', applicationVersion: app.getVersion() });
}
