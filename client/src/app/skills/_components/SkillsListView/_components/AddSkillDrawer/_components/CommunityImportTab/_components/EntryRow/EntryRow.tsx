"use client";

import { useTranslations } from "next-intl";
import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import type { CommunitySkill } from "@/lib/types";
import { useTheme } from "@/lib/contexts";
import { tagColor } from "@/lib/tag-colors";

/**
 * One catalog entry row — path (AC-11's wrap discipline), name, description,
 * tag chips (clicking one applies the cross-folder tag filter, AC-7), and a
 * per-row Import action. Keyed by `path`, never `name` (two entries in
 * different folders can share a name — identity is the path). Entry paths
 * have no spaces (e.g. "python/pytest-discipline.md") and need an explicit
 * wrap opportunity plus `min-w-0` on the flex child (client/INSIGHTS.md 2026-09-24).
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
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[13.5px] font-semibold text-foreground">{entry.name}</span>
          {folderLabel && <span className="rounded-sm bg-muted px-1.5 py-px text-2xs text-subtle-foreground">{folderLabel}</span>}
        </div>
        {entry.description && <div className="text-ui text-muted-foreground">{entry.description}</div>}
        <div className="mono min-w-0 text-[11.5px] text-subtle-foreground wrap-anywhere break-words">{entry.path}</div>
        {entry.tags.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {entry.tags.map((tag) => (
              <TagChip key={tag} slug={tag} color={tagColor(tag, theme)} onClick={() => onTagClick(tag)} />
            ))}
          </div>
        )}
      </div>
      <Button variant="secondary" size="sm" onClick={onImport} disabled={disabled || importing}>
        {importing ? t("community.importing") : t("community.import")}
      </Button>
    </div>
  );
}
