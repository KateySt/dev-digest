"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SplitPane } from "@/components/split-pane";
import { DataPagination, GRID_DEFAULT_PAGE_SIZE, GRID_PAGE_SIZES, usePagedList } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useRepos } from "@/lib/hooks";
import { useActiveRepo } from "@/lib/contexts";
import { SkillCard } from "./_components/SkillCard";
import { SkillEditor } from "./_components/SkillEditor";
import { VALID_SKILL_TABS } from "./_components/SkillEditor/constants";
import { AddSkillDrawer } from "./_components/AddSkillDrawer";
import { SEARCH_BOX, SEARCH_INPUT } from "./constants";
import { filterSkills } from "./helpers";

/** Scope-switcher sentinel for "every skill, unfiltered" — the server's own
 *  default when `repo_id` is omitted (2026-10-02 amendment, AC-36). Distinct
 *  from the reserved `"none"` literal, which means global-only (AC-37). */
const ALL_PROJECTS = "__all__";

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5";

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
  const pager = usePagedList({
    listKey: "skills",
    rows: skills ? list : undefined,
    pageSizes: GRID_PAGE_SIZES,
    defaultPageSize: GRID_DEFAULT_PAGE_SIZE,
    resetOn: [query, scope],
  });

  const listPane = (
    <div className="h-full overflow-auto px-7 pt-6 pb-11">
      {/* Wraps instead of overflowing into the divider when the list pane is narrow. */}
      <div className="mb-5 flex flex-wrap items-center gap-3.5">
        <div className="min-w-30 flex-1">
          <h1 className="text-4xl font-bold tracking-[-0.02em]">{t("page.heading")}</h1>
        </div>
        <div className="w-[190px] shrink-0">
          <SelectField
            value={scope ?? "none"}
            onChange={setManualScope}
            options={scopeOptions}
            mono={false}
            ariaLabel={t("page.scope.label")}
          />
        </div>
        <div className={cn(SEARCH_BOX, "w-[200px]")}>
          <Icon.Search size={13} className="shrink-0 text-subtle-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            aria-label={t("page.searchPlaceholder")}
            className={SEARCH_INPUT}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Icon.Plus aria-hidden />
              {t("page.addSkill")}
              <Icon.ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[220px]">
            <DropdownMenuItem onSelect={() => setAddingTab("file")}>
              <Icon.Upload aria-hidden />
              {t("page.menu.fromFile")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAddingTab("url")}>
              <Icon.Link aria-hidden />
              {t("page.menu.fromUrl")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAddingTab("community")}>
              <Icon.Search aria-hidden />
              {t("page.menu.community")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading && (
        <div className={GRID}>
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[120px] w-full" />
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
        <div className={GRID}>
          {pager.pageRows.map((sk) => (
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
      {list.length > 0 && <DataPagination pager={pager} className="mt-4" />}
    </div>
  );

  const detailPane = selected ? (
    <SkillEditor skillId={selected} tab={tab} onTab={setTab} onClosed={() => selectSkill(null)} />
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center text-subtle-foreground">
      <Icon.Sparkles size={22} aria-hidden />
      <div className="text-md font-semibold text-muted-foreground">{t("page.selectPrompt.title")}</div>
      <div className="max-w-[220px] text-sm">{t("page.selectPrompt.body")}</div>
    </div>
  );

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {addingTab && <AddSkillDrawer initialTab={addingTab} onClose={() => setAddingTab(null)} />}
      <SplitPane
        storageKey="dd-split-skills"
        defaultRightWidth={560}
        minLeftWidth={340}
        minRightWidth={420}
        className="h-[calc(100vh-52px)]"
        rightClassName="overflow-auto bg-surface p-6"
        left={listPane}
        right={detailPane}
      />
    </AppShell>
  );
}
