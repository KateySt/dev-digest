"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/form-field";
import { SelectField } from "@/components/select-field";
import type { Repo } from "@/lib/types";

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
      <div className="mb-4 rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-sm leading-normal text-muted-foreground">
        {t("community.noRepos")}{" "}
        <Link href="/onboarding" className="font-semibold text-primary">
          {t("community.addRepoLink")}
        </Link>
      </div>
    );
  }

  const options = repos.map((r) => ({ value: r.id, label: r.full_name }));

  return (
    <FormField label={t("community.projectLabel")}>
      <SelectField
        value={value ?? repos[0]!.id}
        onChange={onChange}
        options={options}
        mono={false}
        ariaLabel={t("community.projectLabel")}
      />
    </FormField>
  );
}
