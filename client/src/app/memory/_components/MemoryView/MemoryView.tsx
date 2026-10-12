/* Memory page (SPEC-2026-10-12-memory AC-24..AC-29): filter rail, searchable
   card list for the active repo (+ global), detail panel. `?id=` preselects a
   memory (the "Learned" link on a finding card). */
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton, TextInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/contexts";
import { useAgents } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { useMemories, useMemory } from "@/lib/hooks/memory";
import { FilterRail } from "./_components/filter-rail";
import { MemoryCard } from "./_components/memory-card";
import { MemoryDetail } from "./_components/memory-detail";
import { MEMORY_KINDS, MEMORY_SCOPES, SEARCH_DEBOUNCE_MS } from "./constants";
import { filterMemories } from "./helpers";
import { s } from "./styles";

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

  React.useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const memories = useMemories({
    repo_id: repoId ?? undefined,
    stale: showStale,
    archived: showArchived,
    q: q || undefined,
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

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.layout}>
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

        <div style={s.center}>
          <div style={s.header}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <span style={s.subtitle}>{t("page.count", { count: items.length })}</span>
            </div>
            <div style={s.searchRow}>
              <div style={{ flex: 1 }}>
                <TextInput value={search} onChange={setSearch} placeholder={t("page.searchPlaceholder")} />
              </div>
              {memories.data && (
                <span style={s.modeBadge} title={t("page.searchModeHint")}>
                  {t(`page.searchMode.${memories.data.search_mode}`)}
                </span>
              )}
            </div>
          </div>

          <div style={s.list}>
            {memories.data ? (
              items.length === 0 ? (
                <div style={s.empty}>
                  <EmptyState icon="Brain" title={t("page.empty.title")} body={t("page.empty.body")} />
                </div>
              ) : (
                items.map((m) => (
                  <MemoryCard key={m.id} m={m} now={now} selected={m.id === selectedId} onSelect={setSelectedId} />
                ))
              )
            ) : memories.error ? (
              <ErrorState title={t("page.loadError")} onRetry={() => memories.refetch()} />
            ) : (
              <Skeleton height={120} />
            )}
          </div>
        </div>

        {selected ? (
          <MemoryDetail
            key={selected.id}
            m={selected}
            repoId={repoId}
            agentOptions={(agents.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
            skillOptions={(skills.data ?? [])
              .filter((sk) => !sk.repo_id || sk.repo_id === (selected.repo_id ?? repoId))
              .map((sk) => ({ id: sk.id, name: sk.name }))}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <aside style={s.detail}>
            <span style={s.muted}>{t("detail.empty")}</span>
          </aside>
        )}
      </div>
    </AppShell>
  );
}
