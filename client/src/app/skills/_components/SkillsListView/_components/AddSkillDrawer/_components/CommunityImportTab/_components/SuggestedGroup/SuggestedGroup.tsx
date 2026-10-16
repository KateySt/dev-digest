"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import type { CommunitySkill } from "@/lib/types";
import { EntryRow } from "../EntryRow";

/**
 * Pinned "Suggested for <project>" group above the folder accordion (client
 * spec AC-42 – AC-46) — visually distinct from a folder row, always
 * expanded, excluded from the accordion's own collapse state. Browse-mode
 * only: the parent omits this component entirely while a search/tag filter
 * is active (AC-46) rather than this component self-hiding, so the "omitted"
 * and "filtered" cases stay simple call-site conditionals.
 */
export function SuggestedGroup({
  projectName,
  entries,
  disabled,
  importingPath,
  onImport,
  onTagClick,
}: {
  projectName: string;
  entries: CommunitySkill[];
  disabled?: boolean;
  importingPath: string | null;
  onImport: (path: string) => void;
  onTagClick: (tag: string) => void;
}) {
  const t = useTranslations("skills");
  if (entries.length === 0) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-primary">
      <div className="flex items-center gap-1.75 bg-brand-bg px-3 py-2.25 text-ui font-semibold text-primary">
        <Icon.Sparkles size={14} aria-hidden />
        <span>{t("community.suggestedFor", { project: projectName })}</span>
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        {entries.map((entry) => (
          <EntryRow
            key={entry.path}
            entry={entry}
            folderLabel={entry.folder}
            disabled={disabled}
            importing={importingPath === entry.path}
            onImport={() => onImport(entry.path)}
            onTagClick={onTagClick}
          />
        ))}
      </div>
    </div>
  );
}
