"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, CiInstallation } from "@devdigest/shared";
import { useAgentCi } from "@/lib/hooks/ci";
import { ExportWizard, type ExportWizardProps } from "./_components/ExportWizard";
import { FailCiOnCard } from "./_components/FailCiOnCard";
import { InstallationRow } from "./_components/InstallationRow";
import { RecentCiRuns } from "./_components/RecentCiRuns";
import { wizardPrefill } from "./helpers";
import { s } from "./styles";

/** CI tab - where this agent is installed, whether each installation is
 *  current, the Fail CI on policy, recent CI history, and the Export wizard. */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const { data, isLoading } = useAgentCi(agent.id);
  const [wizard, setWizard] = React.useState<ExportWizardProps["initial"] | null>(null);

  const installations = data?.installations ?? [];
  const hasInstallations = installations.length > 0;

  return (
    <div style={s.wrap}>
      {wizard && <ExportWizard agent={agent} initial={wizard} onClose={() => setWizard(null)} />}

      <div style={s.header}>
        <div style={s.headerText}>
          <span style={s.h2}>{t("ciTab.heading")}</span>
          <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
            {t("ciTab.activeIn", { count: installations.length })}
          </Badge>
        </div>
        {hasInstallations && (
          <>
            <Button size="sm" icon="RefreshCw" onClick={() => setWizard(wizardPrefill(installations))}>
              {t("ciTab.updateCiConfig")}
            </Button>
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizard({})}>
              {t("ciTab.addToCi")}
            </Button>
          </>
        )}
      </div>

      <FailCiOnCard agent={agent} />

      {isLoading && <Skeleton height={80} />}

      {!isLoading && !hasInstallations && (
        <div style={s.empty}>
          <div>{t("ciTab.empty")}</div>
          <Button kind="primary" size="sm" icon="Plus" onClick={() => setWizard({})}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      )}

      {hasInstallations && (
        <div style={s.list}>
          {installations.map((inst) => (
            <InstallationRow key={inst.id} installation={inst} onUpdate={(i) => setWizard(toPrefill(i))} />
          ))}
          <button type="button" style={s.addRepo} onClick={() => setWizard({})}>
            <Icon.Plus size={14} />
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
