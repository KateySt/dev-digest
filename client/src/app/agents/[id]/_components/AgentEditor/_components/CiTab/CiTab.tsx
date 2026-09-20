"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentCiInstallations } from "../../../../../../../lib/hooks/ci";
import { useRepos } from "../../../../../../../lib/hooks/core";
import { PublishDialog } from "./_components/PublishDialog";
import { s } from "./styles";

/** CI tab — deployed-repos list + "Publish to CI"/"Update CI" (same action,
 *  the label just reflects whether an installation already exists). */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const { data: repos } = useRepos();
  const { data: installations, isLoading } = useAgentCiInstallations(agent.id);
  const [publishing, setPublishing] = React.useState(false);

  const hasNoRepo = repos != null && repos.length === 0;
  const hasInstallations = (installations?.length ?? 0) > 0;

  return (
    <div style={s.wrap}>
      {publishing && (
        <PublishDialog
          agent={agent}
          defaultRepo={installations?.[0]?.repo}
          onClose={() => setPublishing(false)}
        />
      )}

      <div style={s.header}>
        <div style={s.headerText}>
          <div style={s.h2}>{t("ciTab.heading")}</div>
          <div style={s.subtitle}>{t("ciTab.subtitle")}</div>
        </div>
        {!hasNoRepo && (
          <Button kind="primary" size="sm" icon="GitPullRequest" onClick={() => setPublishing(true)}>
            {hasInstallations ? t("ciTab.update") : t("ciTab.publish")}
          </Button>
        )}
      </div>

      {hasNoRepo && <div style={s.noRepo}>{t("ciTab.noRepo")}</div>}

      {isLoading && <Skeleton height={80} />}

      {!isLoading && !hasNoRepo && !hasInstallations && <div style={s.empty}>{t("ciTab.empty")}</div>}

      {!isLoading && hasInstallations && (
        <div style={s.list}>
          {installations!.map((inst) => (
            <div key={inst.id} style={s.row}>
              <span style={s.rowRepo}>{inst.repo}</span>
              <Badge color="var(--text-secondary)" mono>
                {inst.target_type}
              </Badge>
              <span style={s.rowMeta}>
                {t("ciTab.installed", { date: new Date(inst.installed_at).toLocaleDateString() })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
