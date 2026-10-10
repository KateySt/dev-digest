"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon, TagChip } from "@devdigest/ui";
import { useTheme } from "@/lib/contexts";
import { tagColor } from "@/lib/tag-colors";
import { useImportCommunitySkill, useSkillSuggestions } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

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
    <div style={s.card}>
      <div style={s.header}>
        <Icon.Sparkles size={15} style={s.headerIcon} />
        <span style={s.title}>{t("community.suggestionsCardTitle")}</span>
      </div>

      {!data.available ? (
        <div style={s.unavailable}>
          <div>{data.message ?? t("community.unavailable.fallbackBody")}</div>
          <Link href="/settings/catalog" style={s.settingsLink}>
            {t("community.unavailable.settingsLink")}
          </Link>
        </div>
      ) : (
        <div style={s.list}>
          {data.entries.map((entry) => (
            <div key={entry.path} style={s.row}>
              <div style={s.info}>
                <div style={s.name}>{entry.name}</div>
                {entry.description && <div style={s.desc}>{entry.description}</div>}
                <div style={s.tags}>
                  {entry.tags.map((tag) => (
                    <TagChip key={tag} slug={tag} color={tagColor(tag, theme)} />
                  ))}
                </div>
              </div>
              <Button
                kind="secondary"
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
