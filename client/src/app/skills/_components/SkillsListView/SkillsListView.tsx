"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Select, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { useRepos } from "../../../../lib/hooks";
import { useActiveRepo } from "@/lib/repo-context";
import { SkillCard } from "./_components/SkillCard";
import { SkillEditor } from "./_components/SkillEditor";
import { VALID_SKILL_TABS } from "./_components/SkillEditor/constants";
import { AddSkillDrawer } from "./_components/AddSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

/** Scope-switcher sentinel for "every skill, unfiltered" — the server's own
 *  default when `repo_id` is omitted (2026-10-02 amendment, AC-36). Distinct
 *  from the reserved `"none"` literal, which means global-only (AC-37). */
const ALL_PROJECTS = "__all__";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: repos } = useRepos();
  const { activeRepo, reposLoaded } = useActiveRepo();

  // Project-scope switcher (2026-10-02 amendment). Default: the active
  // repo's working set (that project + global), or global-only if no repo
  // resolves — never "fail open" to the unfiltered list (client/INSIGHTS.md
  // 2026-09-15: loading and confirmed-zero-repos are different states, so we
  // hold off fetching — `scope === null` — until `reposLoaded`, rather than
  // fetching the wrong default and re-fetching a moment later). A manual
  // pick from the switcher overrides this for the rest of the page's life.
  const [manualScope, setManualScope] = React.useState<string | null>(null);
  const autoScope = reposLoaded ? (activeRepo ? activeRepo.id : "none") : null;
  const scope = manualScope ?? autoScope;
  const repoFilter = scope === null || scope === ALL_PROJECTS ? undefined : scope;

  const { data: skills, isLoading: skillsLoading, isError, refetch } = useSkills(repoFilter, {
    enabled: scope !== null,
  });
  const isLoading = scope === null || skillsLoading;
  const update = useUpdateSkill();
  const repoNameById = new Map((repos ?? []).map((r) => [r.id, r.full_name]));
  const [addingTab, setAddingTab] = React.useState<"file" | "url" | "community" | null>(null);
  const [query, setQuery] = React.useState("");

  const scopeOptions = [
    { value: ALL_PROJECTS, label: t("page.scope.all") },
    { value: "none", label: t("page.scope.global") },
    ...(repos ?? []).map((r) => ({ value: r.id, label: r.full_name })),
  ];

  const selected = search.get("skill");
  const tab = VALID_SKILL_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";

  const selectSkill = (id: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (id) sp.set("skill", id);
    else sp.delete("skill");
    router.replace(`/skills?${sp.toString()}`);
  };
  const setTab = (tabKey: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", tabKey);
    router.replace(`/skills?${sp.toString()}`);
  };

  const list = filterSkills(skills ?? [], query);

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {addingTab && <AddSkillDrawer initialTab={addingTab} onClose={() => setAddingTab(null)} />}
      <div style={s.page}>
        <div style={s.left}>
          <div style={s.header}>
            <div style={s.headerText}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
            </div>
            <div style={s.scopeSwitcher}>
              <Select value={scope ?? "none"} onChange={setManualScope} options={scopeOptions} mono={false} />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
            <Dropdown
              width={220}
              align="right"
              trigger={
                <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                  {t("page.addSkill")}
                </Button>
              }
              items={[
                { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setAddingTab("file") },
                { label: t("page.menu.fromUrl"), icon: "Link", onClick: () => setAddingTab("url") },
                { label: t("page.menu.community"), icon: "Search", onClick: () => setAddingTab("community") },
              ]}
            />
          </div>

          {isLoading && (
            <div style={s.grid}>
              <Skeleton height={120} />
              <Skeleton height={120} />
              <Skeleton height={120} />
            </div>
          )}
          {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
          {!isLoading && !isError && list.length === 0 && (
            <EmptyState
              icon="Sparkles"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={t("page.empty.cta")}
              onCta={() => setAddingTab("file")}
            />
          )}
          {list.length > 0 && (
            <div style={s.grid}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === selected}
                  onClick={() => selectSkill(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                  repoName={sk.repo_id ? (repoNameById.get(sk.repo_id) ?? null) : null}
                />
              ))}
            </div>
          )}
        </div>

        <div style={s.right}>
          {selected ? (
            <SkillEditor skillId={selected} tab={tab} onTab={setTab} onClosed={() => selectSkill(null)} />
          ) : (
            <div style={s.selectPrompt}>
              <Icon.Sparkles size={22} />
              <div style={s.selectPromptTitle}>{t("page.selectPrompt.title")}</div>
              <div style={s.selectPromptBody}>{t("page.selectPrompt.body")}</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
