"use client";

import { useTranslations } from "next-intl";
import { Button, TagChip } from "@devdigest/ui";
import type { CommunitySkill } from "@/lib/types";
import { useTheme } from "@/lib/contexts/theme";
import { tagColor } from "@/lib/tag-colors";
import { s } from "./styles";

/**
 * One catalog entry row — path (AC-11's wrap discipline), name, description,
 * tag chips (clicking one applies the cross-folder tag filter, AC-7), and a
 * per-row Import action. Keyed by `path`, never `name` (two entries in
 * different folders can share a name — identity is the path).
 */
export function EntryRow({
  entry,
  folderLabel,
  disabled,
  importing,
  onImport,
  onTagClick,
}: {
  entry: CommunitySkill;
  /** Shown in flat (search/tag-filter/suggestions) mode, omitted in the accordion. */
  folderLabel?: string;
  disabled?: boolean;
  importing?: boolean;
  onImport: () => void;
  onTagClick: (tag: string) => void;
}) {
  const t = useTranslations("skills");
  const { theme } = useTheme();

  return (
    <div style={s.row}>
      <div style={s.info}>
        <div style={s.nameRow}>
          <span style={s.name}>{entry.name}</span>
          {folderLabel && <span style={s.folderLabel}>{folderLabel}</span>}
        </div>
        {entry.description && <div style={s.desc}>{entry.description}</div>}
        <div style={s.path}>{entry.path}</div>
        {entry.tags.length > 0 && (
          <div style={s.tags}>
            {entry.tags.map((tag) => (
              <TagChip key={tag} slug={tag} color={tagColor(tag, theme)} onClick={() => onTagClick(tag)} />
            ))}
          </div>
        )}
      </div>
      <Button kind="secondary" size="sm" onClick={onImport} disabled={disabled || importing}>
        {importing ? t("community.importing") : t("community.import")}
      </Button>
    </div>
  );
}
