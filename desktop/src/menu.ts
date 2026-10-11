import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { RELEASES_URL, dataPaths } from './config';
import { checkForUpdates } from './updater';

export function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const help: MenuItemConstructorOptions[] = [
    { label: 'Check for Updates…', click: () => void checkForUpdates(true) },
    { label: 'Releases', click: () => void shell.openExternal(RELEASES_URL) },
    { type: 'separator' },
    { label: 'Open Logs Folder', click: () => void shell.openPath(dataPaths().logs) },
    { label: 'Open Data Folder', click: () => void shell.openPath(dataPaths().userData) },
  ];
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { role: 'help', submenu: [...help, ...(isMac ? [] : [{ type: 'separator' } as const, { role: 'about' } as const])] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  app.setAboutPanelOptions({ applicationName: 'DevDigest', applicationVersion: app.getVersion() });
}
