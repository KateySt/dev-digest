/* /agents — Agents list (A2, L03). AgentCards + create. Selecting an agent
   navigates to the 5-tab editor at /agents/:id. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Agent, AgentPerfRow } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useAgents, useAgentSkillLinks, useUpdateAgent } from "@/lib/hooks/agents";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import { AgentCard } from "../AgentCard";
import { CreateAgentModal } from "./_components/CreateAgentModal";
import { CARD_GRID, TEMPLATES } from "./constants";
import { filterAgents } from "./helpers";

/** Wraps AgentCard with its own skill-link count (AgentCard itself stays a
 *  dumb, prop-driven component — hooks can't run inside a .map() callback).
 *  Perf rows come from ONE workspace-wide query at the list level (below),
 *  not one query per card — unlike the skill-link count, which is genuinely
 *  per-agent data with no batched endpoint today. */
function AgentCardWithExtras({
  agent,
  perf,
  onClick,
  onToggle,
}: {
  agent: Agent;
  perf?: AgentPerfRow;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const { data: links } = useAgentSkillLinks(agent.id);
  return (
    <AgentCard
      ag={agent}
      skillCount={links?.length}
      perf={perf}
      onClick={onClick}
      onToggle={onToggle}
    />
  );
}

export function AgentsListView() {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const { data: perf } = useAgentPerformance();
  const update = useUpdateAgent();
  const [creating, setCreating] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const list = filterAgents(agents ?? [], search);
  const perfByAgentId = new Map((perf?.agents ?? []).map((row) => [row.agent_id, row]));

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div className="mx-auto max-w-[1100px] px-8 pt-6 pb-11">
        <div className="mb-5 flex items-center gap-3.5">
          <div className="flex-1">
            <h1 className="text-4xl font-bold tracking-[-0.02em]">{t("list.title")}</h1>
            <p className="mt-1 text-base text-muted-foreground">{t("list.subtitle")}</p>
          </div>
          <div className="flex w-50 items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3 py-2">
            <Icon.Search size={13} className="text-subtle-foreground" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("list.searchPlaceholder")}
              aria-label={t("list.searchLabel")}
              className="flex-1 border-none bg-transparent text-sm text-foreground outline-none"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Icon.Plus aria-hidden />
                {t("list.addAgent")}
                <Icon.ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-55">
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Icon.Edit aria-hidden />
                {t("list.createFromScratch")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {TEMPLATES.map((tp) => (
                <DropdownMenuItem key={tp} className="text-muted-foreground" onSelect={() => setCreating(true)}>
                  <Icon.Cpu aria-hidden />
                  {tp}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isLoading && (
          <div className={CARD_GRID}>
            <Skeleton className="h-30 w-full" />
            <Skeleton className="h-30 w-full" />
            <Skeleton className="h-30 w-full" />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div className={CARD_GRID}>
            {list.map((a) => (
              <AgentCardWithExtras
                key={a.id}
                agent={a}
                perf={perfByAgentId.get(a.id)}
                onClick={() => router.push(`/agents/${a.id}?tab=config`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
