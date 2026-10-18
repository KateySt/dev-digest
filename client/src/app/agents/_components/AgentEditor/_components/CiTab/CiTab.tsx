"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { useAgentCi } from "@/lib/hooks/ci";
import { ExportWizard, type ExportWizardProps } from "./_components/ExportWizard";
import { FailCiOnCard } from "./_components/FailCiOnCard";
import { InstallationRow } from "./_components/InstallationRow";
import { RecentCiRuns } from "./_components/RecentCiRuns";
import { wizardPrefill } from "./helpers";

/** CI tab - where this agent is installed, whether each installation is
 *  current, the Fail CI on policy, recent CI history, and the Export wizard. */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const { data, isLoading } = useAgentCi(agent.id);
  const [wizard, setWizard] = React.useState<ExportWizardProps["initial"] | null>(null);

  const installations = data?.installations ?? [];
  const hasInstallations = installations.length > 0;

  return (
    <div className="flex max-w-[720px] min-w-0 flex-col gap-5">
      {wizard && <ExportWizard agent={agent} initial={wizard} onClose={() => setWizard(null)} />}

      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="text-lg font-bold">{t("ciTab.heading")}</span>
          <Badge variant="ok">
            <span aria-hidden className="size-1.5 rounded-full bg-ok" />
            {t("ciTab.activeIn", { count: installations.length })}
          </Badge>
        </div>
        {hasInstallations && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setWizard(wizardPrefill(installations))}>
              <Icon.RefreshCw aria-hidden />
              {t("ciTab.updateCiConfig")}
            </Button>
            <Button size="sm" onClick={() => setWizard({})}>
              <Icon.Plus aria-hidden />
              {t("ciTab.addToCi")}
            </Button>
          </>
        )}
      </div>

      <FailCiOnCard agent={agent} />

      {isLoading && <Skeleton className="h-20 w-full" />}

      {!isLoading && !hasInstallations && (
        <div className="flex flex-col items-start gap-3 text-sm text-subtle-foreground">
          <div>{t("ciTab.empty")}</div>
          <Button size="sm" onClick={() => setWizard({})}>
            <Icon.Plus aria-hidden />
            {t("ciTab.addToCi")}
          </Button>
        </div>
      )}

      {hasInstallations && (
        <div className="flex flex-col gap-2">
          {installations.map((inst) => (
            <InstallationRow key={inst.id} installation={inst} onUpdate={(i) => setWizard(toPrefill(i))} />
          ))}
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-transparent px-3.5 py-2.75 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setWizard({})}
          >
            <Icon.Plus size={14} aria-hidden />
            {t("ciTab.addRepository")}
          </button>
        </div>
      )}

      {data && <RecentCiRuns runs={data.recent_runs} agentName={agent.name} />}
    </div>
  );
}

function toPrefill(inst: CiInstallation): NonNullable<ExportWizardProps["initial"]> {
  return wizardPrefill([inst]);
}
