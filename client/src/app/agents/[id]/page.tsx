/* /agents/:id — Agent Editor (A2, L03). Left agent list + Config editor
   (model + system prompt). Tab state lives in ?tab=. Ported from
   screen_agents.jsx. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentCard } from "../_components/AgentCard";
import { AgentEditor } from "./_components/AgentEditor";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";

const VALID_TABS = ["config", "skills", "context", "evals", "stats", "ci"];

export default function AgentEditorPage() {
  const t = useTranslations("agents");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    { label: agent?.name ?? t("page.fallbackName") },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("page.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("page.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div className="flex h-[calc(100vh-52px)]">
        {/* left: agent list */}
        <div className="flex w-70 shrink-0 flex-col border-r border-border bg-surface">
          <div className="px-4 pt-4 pb-3">
            <div className="mb-3.5 flex items-center gap-2.5">
              <h1 className="flex-1 text-xl font-bold">{t("list.title")}</h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm">
                    <Icon.Plus aria-hidden />
                    {t("page.add")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52.5">
                  <DropdownMenuItem onSelect={() => router.push("/agents")}>
                    <Icon.Edit aria-hidden />
                    {t("list.createFromScratch")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <div className="flex-1 overflow-auto px-3 pb-3">
            {(agents ?? []).map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                active={a.id === id}
                onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
                onDeleted={() => {
                  if (a.id === id) router.push("/agents");
                }}
              />
            ))}
          </div>
        </div>

        {/* editor */}
        {isLoading || !agent ? (
          <div className="flex flex-1 flex-col gap-4 p-7">
            <Skeleton className="h-6 w-60" />
            <Skeleton className="h-50 w-full" />
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-3 px-7 pt-4">
              <Icon.Cpu size={18} className="text-primary" aria-hidden />
              <h1 className="text-xl font-bold">{agent.name}</h1>
              <Badge variant="neutral" className="mono">
                {agent.provider}/{agent.model}
              </Badge>
              {!agent.enabled && <Badge variant="neutral" className="text-subtle-foreground">{t("page.disabled")}</Badge>}
              <div className="ml-auto">
                <Button variant="secondary" size="sm" onClick={() => router.push("/")}>
                  <Icon.GitPullRequest aria-hidden />
                  {t("page.runOnPr")}
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
