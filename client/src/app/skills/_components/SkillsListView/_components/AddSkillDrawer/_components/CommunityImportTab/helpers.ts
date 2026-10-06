import type { CommunitySkill } from "@/lib/types";
import type { CatalogFolder } from "./_components/FolderAccordion";

/** Group a flat catalog listing payload into folders, sorted by folder name
 *  — the client performs this grouping itself (client spec "the client
 *  groups entries into folders from this one payload"), never a per-folder
 *  request. */
export function groupByFolder(entries: CommunitySkill[]): CatalogFolder[] {
  const map = new Map<string, CommunitySkill[]>();
  for (const entry of entries) {
    if (!map.has(entry.folder)) map.set(entry.folder, []);
    map.get(entry.folder)!.push(entry);
  }
  return [...map.entries()]
    .map(([folder, list]) => ({ folder, entries: list }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}
