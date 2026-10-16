"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { PageTabs } from "@/components/page-tabs";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentPickerDropdown } from "./_components/AgentPickerDropdown";
import { formatAbsoluteDateTime, fullRelativeTime } from "@/app/repos/[repoId]/pulls/helpers";
import type { PrDetail } from "@/lib/types";

interface PrDetailHeaderProps {
  pr: PrDetail;
  prId: string | null;
  tab: string;
  findingsCount: number;
  /** github.com PR URL; null when the repo's full_name isn't known yet. */
  githubUrl?: string | null;
  onSetTab: (tab: string) => void;
  /** Kept for the page's call site; the multi-agent picker navigates away instead of using it. */
  onRunStart?: () => void;
  /** Fired only when a started run returns no multi-run id to navigate to. */
  onRunsStarted?: () => void;
}

export function PrDetailHeader({
  pr,
  prId,
  tab,
  findingsCount,
  githubUrl,
  onSetTab,
  onRunsStarted,
}: PrDetailHeaderProps) {
  const t = useTranslations("prReview.detail");
  const status =
    pr.status === "merged"
      ? { text: "text-ok", dot: "bg-ok" }
      : pr.status === "closed"
        ? { text: "text-stale", dot: "bg-stale" }
        : { text: "text-warn", dot: "bg-warn" };
  const finished = pr.status === "merged" || pr.status === "closed";

  return (
    <div className="shrink-0 border-b border-border bg-background px-8 pt-4.5">
      <div className="flex items-start gap-4.5">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-[-0.02em]">
            <span className="mono text-xl font-medium text-subtle-foreground">#{pr.number}</span>
            {pr.title}
          </h1>
          <div className="mt-2.5 mb-3.5 flex flex-wrap items-center gap-3.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <UserAvatar name={pr.author} avatarUrl={pr.avatar_url} size={17} />
              {pr.author}
            </span>
            {pr.opened_at && (
              <span className="inline-flex cursor-default items-center gap-1.5" title={formatAbsoluteDateTime(pr.opened_at)}>
                <Icon.Clock size={13} className="text-subtle-foreground" aria-hidden />
                {t("opened", { time: fullRelativeTime(pr.opened_at) })}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Icon.GitBranch size={13} className="text-subtle-foreground" aria-hidden />
              <span className="mono text-xs">{pr.branch}</span>
              <Icon.ArrowRight size={11} aria-hidden />
              <span className="mono text-xs">{pr.base}</span>
            </span>
            <span className="mono tnum">
              <span className="text-code-add-text">+{pr.additions}</span>{" "}
              <span className="text-code-del-text">−{pr.deletions}</span>
            </span>
            <Badge variant="ghost" className={cn("gap-1.5 px-0", status.text)}>
              <span aria-hidden className={cn("size-1.5 rounded-full", status.dot)} />
              {pr.status}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <Button
            variant="outline"
            size="sm"
            disabled={!githubUrl}
            onClick={() => githubUrl && window.open(githubUrl, "_blank", "noopener,noreferrer")}
          >
            <Icon.ExternalLink aria-hidden />
            {t("viewOnGithub")}
          </Button>
          {prId && <AgentPickerDropdown prId={prId} warnMerged={finished} onRunsStarted={onRunsStarted} />}
        </div>
      </div>
      {finished && (
        <div className="mt-3 flex items-center gap-2 text-ui text-subtle-foreground">
          <Icon.AlertTriangle size={13} className="shrink-0 text-warn" aria-hidden />
          <span>{t("mergedNotice", { status: pr.status })}</span>
        </div>
      )}
      <PageTabs
        value={tab}
        onChange={onSetTab}
        tabs={[
          { key: "overview", label: t("tabs.overview"), icon: "FileText" },
          { key: "findings", label: t("tabs.findings"), icon: "AlertOctagon", count: findingsCount || undefined },
          { key: "diff", label: t("tabs.diff"), icon: "Code", count: pr.files_count },
        ]}
      />
    </div>
  );
}
