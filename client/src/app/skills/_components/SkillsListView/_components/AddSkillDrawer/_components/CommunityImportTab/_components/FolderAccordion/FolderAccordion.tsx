"use client";

import { Icon } from "@/components/icon";
import type { CommunitySkill } from "@/lib/types";
import { EntryRow } from "../EntryRow";

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
    <div className="flex flex-col gap-1.5">
      {folders.map(({ folder, entries }) => {
        const isOpen = expanded.has(folder);
        return (
          <div key={folder} className="overflow-hidden rounded-lg border border-border">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => onToggle(folder)}
              className="flex w-full cursor-pointer items-center gap-2 border-none bg-surface px-3 py-2.25 text-left text-foreground"
            >
              {isOpen ? <Icon.ChevronDown size={14} aria-hidden /> : <Icon.ChevronRight size={14} aria-hidden />}
              <Icon.Folder size={14} className="text-subtle-foreground" aria-hidden />
              <span className="flex-1 text-[13.5px] font-semibold">{folder}</span>
              <span className="rounded-full bg-muted px-2 py-px text-[11.5px] text-subtle-foreground">{entries.length}</span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1.5 border-t border-border p-2">
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
