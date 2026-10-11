"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton, TextInput } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/contexts";
import { useToast } from "@/lib/contexts";
import { ApiError } from "@/lib/api";
import {
  useCommunitySkills,
  useImportCommunitySkill,
  useSkillSuggestions,
} from "@/lib/hooks/skills";
import { ProjectPicker } from "./_components/ProjectPicker";
import { FolderAccordion } from "./_components/FolderAccordion";
import { SuggestedGroup } from "./_components/SuggestedGroup";
import { EntryRow } from "./_components/EntryRow";
import { groupByFolder } from "./helpers";
import { s } from "./styles";
import { s as sForm } from "../../styles";

/**
 * Community tab (SPEC-07 client spec) — folder accordion over the single
 * catalog listing payload, cross-folder search/tag filter, a required
 * project picker, and three visibly distinct non-result states (unavailable
 * / reachable-empty / filter-matched-nothing) so a misconfigured catalog can
 * never read as an empty one.
 */
export function CommunityImportTab() {
  const t = useTranslations("skills");
  const toast = useToast();
  const { repos, activeRepo, reposLoaded } = useActiveRepo();

  const [repoId, setRepoId] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [importingPath, setImportingPath] = React.useState<string | null>(null);

  // Pre-select the active repo once it resolves; never overrides a change
  // the user already made in the picker (AC-17/AC-18).
  React.useEffect(() => {
    if (repoId == null && activeRepo) setRepoId(activeRepo.id);
  }, [activeRepo, repoId]);

  const effectiveRepoId = repoId ?? activeRepo?.id ?? null;
  const effectiveRepo = repos.find((r) => r.id === effectiveRepoId) ?? null;
  const filterMode = query.trim().length > 0 || activeTag != null;

  const { data: listing, isLoading, isError, refetch } = useCommunitySkills(
    query.trim() || undefined,
    activeTag ?? undefined,
  );
  const { data: suggestions } = useSkillSuggestions(!filterMode ? effectiveRepoId : null);
  const importSkill = useImportCommunitySkill();

  const importDisabled = reposLoaded && repos.length === 0;

  const clearFilter = () => {
    setQuery("");
    setActiveTag(null);
  };
  const toggleFolder = (folder: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });

  const handleImport = (path: string) => {
    if (!effectiveRepoId) return;
    setImportingPath(path);
    importSkill.mutate(
      { path, repo_id: effectiveRepoId },
      {
        onSuccess: (skill) => {
          setImportingPath(null);
          toast.success(t("community.importSuccess", { name: skill.name, project: effectiveRepo?.full_name ?? "" }));
        },
        onError: (err) => {
          setImportingPath(null);
          toast.error(err instanceof ApiError ? err.message : t("community.importFailed"));
        },
      },
    );
  };

  return (
    <div style={sForm.form}>
      <ProjectPicker repos={repos} reposLoaded={reposLoaded} value={effectiveRepoId} onChange={setRepoId} />

      <div style={s.searchRow}>
        <TextInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (v.trim()) setActiveTag(null);
          }}
          placeholder={t("community.searchPlaceholder")}
        />
      </div>
      {activeTag && (
        <div style={s.activeFilter}>
          <Icon.Tag size={12} />
          <span>{activeTag}</span>
          <button type="button" style={s.clearFilterBtn} onClick={clearFilter}>
            {t("community.clearFilter")}
          </button>
        </div>
      )}

      {isLoading && (
        <div style={s.loadingWrap}>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      )}

      {!isLoading && (isError || listing?.available === false) && (
        <ErrorState
          title={t("community.unavailable.title")}
          body={
            <>
              <div>{listing?.message ?? t("community.unavailable.fallbackBody")}</div>
              <Link href="/settings/catalog" style={s.settingsLink}>
                {t("community.unavailable.settingsLink")}
              </Link>
            </>
          }
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && listing?.available && (
        <>
          {filterMode && listing.entries.length === 0 && (
            <EmptyState
              icon="Search"
              title={t("community.noMatch.title")}
              body={t("community.noMatch.body")}
              cta={t("community.clearFilter")}
              onCta={clearFilter}
            />
          )}

          {!filterMode && listing.entries.length === 0 && (
            <EmptyState icon="Folder" title={t("community.empty.title")} body={t("community.empty.body")} />
          )}

          {filterMode && listing.entries.length > 0 && (
            <div style={s.loadingWrap}>
              {listing.entries.map((entry) => (
                <EntryRow
                  key={entry.path}
                  entry={entry}
                  folderLabel={entry.folder}
                  disabled={importDisabled}
                  importing={importingPath === entry.path}
                  onImport={() => handleImport(entry.path)}
                  onTagClick={setActiveTag}
                />
              ))}
            </div>
          )}

          {!filterMode && listing.entries.length > 0 && (
            <>
              {effectiveRepo && (
                <SuggestedGroup
                  projectName={effectiveRepo.full_name}
                  entries={suggestions?.available ? suggestions.entries : []}
                  disabled={importDisabled}
                  importingPath={importingPath}
                  onImport={handleImport}
                  onTagClick={setActiveTag}
                />
              )}
              <FolderAccordion
                folders={groupByFolder(listing.entries)}
                expanded={expanded}
                onToggle={toggleFolder}
                disabled={importDisabled}
                importingPath={importingPath}
                onImport={handleImport}
                onTagClick={setActiveTag}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
