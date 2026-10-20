/* Memory page (SPEC-2026-10-12-memory AC-24..AC-29): filter rail, searchable
   card list for the active repo (+ global), detail panel. `?id=` preselects a
   memory (the "Learned" link on a finding card). */
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts";
import { useAgents } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { useMemories, useMemory } from "@/lib/hooks/memory";
import { DataPagination, usePageState, usePagedList } from "@/components/pagination";
import { FilterRail } from "./_components/filter-rail";
import { MemoryCard } from "./_components/memory-card";
import { MemoryDetail } from "./_components/memory-detail";
import { CurateDrawer } from "./_components/curate-drawer";
import { MEMORY_CLASSES, MEMORY_KINDS, MEMORY_SCOPES, SEARCH_DEBOUNCE_MS } from "./constants";
import { filterMemories } from "./helpers";

const toggle = (set: ReadonlySet<string>, v: string) => {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

export function MemoryView() {
  const t = useTranslations("memory");
  const { repoId } = useActiveRepo();
  const params = useSearchParams();

  const [scopes, setScopes] = React.useState<ReadonlySet<string>>(() => new Set(MEMORY_SCOPES));
  const [kinds, setKinds] = React.useState<ReadonlySet<string>>(() => new Set(MEMORY_KINDS));
  const [showStale, setShowStale] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(() => params.get("id"));
  const [curating, setCurating] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Server-paged: scope/kind filters go to the API too, so pages and totals stay right.
  const all = (set: ReadonlySet<string>, values: readonly string[]) => set.size === values.length;
  const scopesParam = all(scopes, MEMORY_SCOPES) ? undefined : [...scopes].join(",");
  const kindsParam = all(kinds, MEMORY_KINDS) ? undefined : [...kinds].join(",");
  const pageState = usePageState({ listKey: "memories" });
  const memories = useMemories({
    repo_id: repoId ?? undefined,
    stale: showStale,
    archived: showArchived,
    q: q || undefined,
    scopes: scopesParam,
    kinds: kindsParam,
    page: pageState.page,
    per_page: pageState.pageSize,
  });
  const pager = usePagedList({
    listKey: "memories",
    server: true,
    total: memories.data?.total,
    busy: memories.isPlaceholderData,
    resetOn: [repoId, showStale, showArchived, q, scopesParam, kindsParam],
  });
  const agents = useAgents();
  const skills = useSkills();

  const items = filterMemories(memories.data?.items ?? [], scopes, kinds);
  const listed = memories.data?.items.find((m) => m.id === selectedId) ?? null;
  // A "Learned" link may point at a memory the current filters hide (archived,
  // stale, another repo): fetch it directly instead of showing an empty panel.
  const direct = useMemory(listed ? null : selectedId);
  const selected = listed ?? direct.data ?? null;
  const now = new Date();
  const agentOptions = (agents.data ?? []).map((a) => ({ id: a.id, name: a.name }));
  const skillOptionsFor = (memoryRepoId: string | null) =>
    (skills.data ?? [])
      .filter((sk) => !sk.repo_id || sk.repo_id === (memoryRepoId ?? repoId))
      .map((sk) => ({ id: sk.id, name: sk.name }));

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      {/* Container-sized columns: with the sidebar expanded in the 1024px window
          (~768px here) the filter and detail rails narrow so the list keeps room. */}
      <div className="@container/memory h-full min-h-0">
        <div className="grid h-full min-h-0 grid-cols-[180px_minmax(0,1fr)_300px] @min-[900px]/memory:grid-cols-[220px_minmax(0,1fr)_360px]">
          <FilterRail
            scopes={scopes}
            kinds={kinds}
            counts={memories.data?.counts}
            showStale={showStale}
            showArchived={showArchived}
            onToggleScope={(sc) => setScopes((cur) => toggle(cur, sc))}
            onToggleKind={(k) => setKinds((cur) => toggle(cur, k))}
            onShowStale={setShowStale}
            onShowArchived={setShowArchived}
          />

          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="border-b border-border px-6 pt-5 pb-3.5">
              <div className="mb-3.5 flex items-baseline gap-3">
                <h1 className="m-0 text-3xl font-bold">{t("page.heading")}</h1>
                <span className="text-[13.5px] text-subtle-foreground">{t("page.count", { count: items.length })}</span>
                <div className="ml-auto">
                  <Button variant="secondary" size="sm" onClick={() => setCurating(true)}>
                    <Icon.Sparkles aria-hidden />
                    {t("curate.button")}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="flex-1">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("page.searchPlaceholder")}
                    aria-label={t("page.searchPlaceholder")}
                  />
                </div>
                {memories.data && (
                  <span
                    className="rounded-[5px] bg-elevated px-2 py-0.5 text-xs whitespace-nowrap text-subtle-foreground"
                    title={t("page.searchModeHint")}>
                    {t(`page.searchMode.${memories.data.search_mode}`)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 py-4">
              {memories.data ? (
                items.length === 0 ? (
                  <div className="p-6">
                    <EmptyState icon="Brain" title={t("page.empty.title")} body={t("page.empty.body")} />
                  </div>
                ) : (
                  <>
                    {items.map((m) => (
                      <MemoryCard key={m.id} m={m} now={now} selected={m.id === selectedId} onSelect={setSelectedId} />
                    ))}
                    <DataPagination pager={pager} className="mt-1" />
                  </>
                )
              ) : memories.error ? (
                <ErrorState title={t("page.loadError")} onRetry={() => memories.refetch()} />
              ) : (
                <Skeleton className="h-30 w-full" />
              )}
            </div>
          </div>

          {selected ? (
            <MemoryDetail
              key={selected.id}
              m={selected}
              repoId={repoId}
              agentOptions={agentOptions}
              skillOptions={skillOptionsFor(selected.repo_id)}
              onDeleted={() => setSelectedId(null)}
              onOpenMemory={setSelectedId}
            />
          ) : (
            <aside className={MEMORY_CLASSES.detail}>
              <span className={MEMORY_CLASSES.muted}>{t("detail.empty")}</span>
            </aside>
          )}
        </div>
      </div>

      {curating && (
        <CurateDrawer
          repoId={repoId}
          agentOptions={agentOptions}
          skillOptions={skillOptionsFor(repoId)}
          onClose={() => setCurating(false)}
          onOpenMemory={(id) => {
            setCurating(false);
            setSelectedId(id);
          }}
        />
      )}
    </AppShell>
  );
}
