"use client";

import { Icon } from "@devdigest/ui";
import type { CommunitySkill } from "@/lib/types";
import { EntryRow } from "../EntryRow";
import { s } from "./styles";

export interface CatalogFolder {
  folder: string;
  entries: CommunitySkill[];
}

/**
 * Collapsed-by-default folder accordion (client spec AC-1 – AC-4). Expanding
 * a folder issues no additional request — it only reveals entries already
 * present in `folders` (the one cached listing payload). Keyboard-operable
 * via a real `<button>` with `aria-expanded`.
 */
export function FolderAccordion({
  folders,
  expanded,
  onToggle,
  disabled,
  importingPath,
  onImport,
  onTagClick,
}: {
  folders: CatalogFolder[];
  expanded: Set<string>;
  onToggle: (folder: string) => void;
  disabled?: boolean;
  importingPath: string | null;
  onImport: (path: string) => void;
  onTagClick: (tag: string) => void;
}) {
  return (
    <div style={s.wrap}>
      {folders.map(({ folder, entries }) => {
        const isOpen = expanded.has(folder);
        return (
          <div key={folder} style={s.folder}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => onToggle(folder)}
              style={s.folderHeader}
            >
              {isOpen ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
              <Icon.Folder size={14} style={s.folderIcon} />
              <span style={s.folderName}>{folder}</span>
              <span style={s.folderCount}>{entries.length}</span>
            </button>
            {isOpen && (
              <div style={s.entries}>
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.path}
                    entry={entry}
                    disabled={disabled}
                    importing={importingPath === entry.path}
                    onImport={() => onImport(entry.path)}
                    onTagClick={onTagClick}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
