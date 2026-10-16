import { app, clipboard, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { openExternalSafe } from './validate';

/**
 * Right-click menu for the studio window. Electron ships none, so without this
 * a right-click does nothing — no copy/paste, no spelling fixes.
 * Native labels are English for now (the studio's i18n doesn't reach main).
 */
export function attachContextMenu(win: BrowserWindow): void {
  const { webContents } = win;
  webContents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = [];
    const section = (group: MenuItemConstructorOptions[]) => {
      if (!group.length) return;
      if (items.length) items.push({ type: 'separator' });
      items.push(...group);
    };

    // Spelling: suggestions first, like every native app.
    if (params.misspelledWord) {
      section([
        ...params.dictionarySuggestions.slice(0, 5).map((word) => ({
          label: word,
          click: () => webContents.replaceMisspelling(word),
        })),
        {
          label: 'Add to Dictionary',
          click: () => webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
      ]);
    }

    if (params.linkURL) {
      let external = false;
      try {
        external = new URL(params.linkURL).protocol === 'https:';
      } catch {
        // not a URL — offer copy only
      }
      section([
        ...(external ? [{ label: 'Open Link in Browser', click: () => openExternalSafe(params.linkURL) }] : []),
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
      ]);
    }

    if (params.mediaType === 'image' && params.hasImageContents) {
      section([{ label: 'Copy Image', click: () => webContents.copyImageAt(params.x, params.y) }]);
    }

    const { editFlags } = params;
    if (params.isEditable) {
      section([
        { role: 'undo', enabled: editFlags.canUndo },
        { role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { role: 'cut', enabled: editFlags.canCut },
        { role: 'copy', enabled: editFlags.canCopy },
        { role: 'paste', enabled: editFlags.canPaste },
        { role: 'selectAll', enabled: editFlags.canSelectAll },
      ]);
    } else if (params.selectionText.trim()) {
      section([{ role: 'copy', enabled: editFlags.canCopy }]);
    }

    if (!app.isPackaged) {
      section([{ label: 'Inspect Element', click: () => webContents.inspectElement(params.x, params.y) }]);
    }

    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}
