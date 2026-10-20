/* AgentDetail — the right pane of /agents: the selected agent's header and
   its tabbed editor (config, skills, context, evals, stats, ci). */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { AgentEditor } from "../AgentEditor";

export function AgentDetail({ agentId, tab, onTab }: { agentId: string; tab: string; onTab: (tab: string) => void }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(agentId);

  if (agent) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-3 px-7 pt-4">
          <Icon.Cpu size={18} className="text-primary" aria-hidden />
          <h1 className="text-xl font-bold">{agent.name}</h1>
          <Badge variant="neutral" className="mono">
            {agent.provider}/{agent.model}
          </Badge>
          {!agent.enabled && (
            <Badge variant="neutral" className="text-subtle-foreground">
              {t("page.disabled")}
            </Badge>
          )}
          <div className="ml-auto">
            <Button variant="secondary" size="sm" onClick={() => router.push("/")}>
              <Icon.GitPullRequest aria-hidden />
              {t("page.runOnPr")}
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 overflow-auto">
          <AgentEditor agent={agent} tab={tab} onTab={onTab} />
        </div>
      </div>
    );
  }
  if (isError || !isLoading) {
    return (
      <ErrorState
        title={t("page.loadErrorTitle")}
        body={error instanceof ApiError ? error.message : t("page.loadErrorBody")}
        onRetry={() => refetch()}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4 p-7">
      <Skeleton className="h-6 w-60" />
      <Skeleton className="h-50 w-full" />
    </div>
  );
}
