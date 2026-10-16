"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { TagChip } from "@/components/tag-chip";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/contexts";
import { tagColor } from "@/lib/tag-colors";
import { useImportCommunitySkill, useSkillSuggestions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { ApiError } from "@/lib/api";

/**
 * Repo onboarding page's skill-suggestions card (client spec AC-37 – AC-41).
 * Omitted entirely when there are no suggestions (AC-38) — this is the one
 * suggestion surface where "unavailable" and "empty" diverge (AC-41): an
 * unavailable catalog still renders the card with its own message, while a
 * reachable-but-empty result renders nothing. Imports directly into this
 * page's repo, no project prompt (AC-39), and reuses the shared
 * TagChip/tag-colors pair (not a bespoke chip) per the dev plan.
 */
export function SkillSuggestionsCard({ repoId }: { repoId: string }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { theme } = useTheme();
  const { data } = useSkillSuggestions(repoId);
  const importSkill = useImportCommunitySkill();
  const [importingPath, setImportingPath] = React.useState<string | null>(null);

  if (!data) return null;
  if (data.available && data.entries.length === 0) return null; // AC-38

  const handleImport = (path: string) => {
    setImportingPath(path);
    importSkill.mutate(
      { path, repo_id: repoId },
      {
        onSuccess: (skill) => {
          setImportingPath(null);
          toast.success(t("community.importSuccessSimple", { name: skill.name }));
        },
        onError: (err) => {
          setImportingPath(null);
          toast.error(err instanceof ApiError ? err.message : t("community.importFailed"));
        },
      },
    );
  };

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon.Sparkles size={15} className="text-primary" aria-hidden />
        <span className="text-base font-bold text-foreground">{t("community.suggestionsCardTitle")}</span>
      </div>

      {!data.available ? (
        <div className="text-sm leading-normal text-muted-foreground">
          <div>{data.message ?? t("community.unavailable.fallbackBody")}</div>
          <Link href="/settings/catalog" className="font-semibold text-primary">
            {t("community.unavailable.settingsLink")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.entries.map((entry) => (
            <div key={entry.path} className="flex items-start gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-[13.5px] font-semibold text-foreground">{entry.name}</div>
                {entry.description && <div className="text-ui text-muted-foreground">{entry.description}</div>}
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => (
                    <TagChip key={tag} slug={tag} color={tagColor(tag, theme)} />
                  ))}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleImport(entry.path)}
                disabled={importingPath === entry.path}
              >
                {importingPath === entry.path ? t("community.importing") : t("community.import")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
