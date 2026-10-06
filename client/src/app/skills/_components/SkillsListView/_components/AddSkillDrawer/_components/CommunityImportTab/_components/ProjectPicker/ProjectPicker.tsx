"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormField, Select } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { s } from "./styles";

/**
 * Required, always-visible project picker (client spec AC-17/AC-18). While
 * `repos` hasn't loaded yet, renders nothing — lazily-fetched "zero repos"
 * must gate on `reposLoaded`, never `repos.length === 0` (client/INSIGHTS.md
 * 2026-09-15; loading and confirmed-empty are different states). Once loaded
 * with zero repos, renders the browse-only CTA (AC-20) instead of a picker.
 */
export function ProjectPicker({
  repos,
  reposLoaded,
  value,
  onChange,
}: {
  repos: Repo[];
  reposLoaded: boolean;
  value: string | null;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("skills");

  if (!reposLoaded) return null;

  if (repos.length === 0) {
    return (
      <div style={s.zeroRepos}>
        {t("community.noRepos")}{" "}
        <Link href="/onboarding" style={s.zeroReposLink}>
          {t("community.addRepoLink")}
        </Link>
      </div>
    );
  }

  const options = repos.map((r) => ({ value: r.id, label: r.full_name }));

  return (
    <FormField label={t("community.projectLabel")}>
      <Select value={value ?? repos[0]!.id} onChange={onChange} options={options} mono={false} />
    </FormField>
  );
}
