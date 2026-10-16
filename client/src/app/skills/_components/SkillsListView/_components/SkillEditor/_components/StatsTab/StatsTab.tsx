"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
// Charts (MetricCard, Donut) have no Tailwind replacement yet — still vendor.
import { Donut, MetricCard } from "@/components/charts";
import { CircularScore } from "@/components/circular-score";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR, FALLBACK_CATEGORY_COLOR } from "./constants";

const SECTION_TITLE = "mb-2.5 text-base font-bold";
const EMPTY_NOTE = "text-sm text-subtle-foreground";
const TILE_ROW = "flex flex-wrap gap-3";

/** Stats tab — Used By / Pull Frequency / Accept Rate / Findings 30D tiles,
 *  the agents currently linked to this skill, and a findings-by-category
 *  breakdown. All numbers are an APPROXIMATION: findings aren't attributed to
 *  a specific skill, only to the agent that produced them, so this rolls up
 *  every agent currently using the skill (see the server's `computeSkillStats`
 *  doc comment). */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className={TILE_ROW}>
          <Skeleton className="h-[90px] min-w-[120px] flex-1" />
          <Skeleton className="h-[90px] min-w-[120px] flex-1" />
          <Skeleton className="h-[90px] min-w-[120px] flex-1" />
          <Skeleton className="h-[90px] min-w-[120px] flex-1" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !stats) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  if (stats.used_by_agents === 0) {
    return <EmptyState icon="Gauge" title={t("stats.empty.title")} body={t("stats.empty.body")} />;
  }

  const acceptPct = stats.accept_rate != null ? Math.round(stats.accept_rate * 100) : null;
  const pullPct = stats.pull_frequency != null ? Math.round(stats.pull_frequency * 100) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className={TILE_ROW}>
        <MetricCard label={t("stats.tiles.usedBy")} value={stats.used_by_agents} />
        <MetricCard
          label={t("stats.tiles.pullFrequency")}
          value={pullPct ?? "—"}
          suffix={pullPct != null ? "%" : undefined}
        />
        <div className="flex min-w-[140px] flex-1 items-center gap-3.5 rounded-[9px] border border-border bg-elevated p-4.5">
          <CircularScore score={acceptPct ?? 0} size={44} />
          <div>
            <div className="text-xs font-semibold tracking-[0.03em] text-subtle-foreground">{t("stats.tiles.acceptRate")}</div>
            <div className="tnum mt-1 text-3xl font-bold">
              {acceptPct != null ? `${acceptPct}%` : "—"}
            </div>
          </div>
        </div>
        <MetricCard label={t("stats.tiles.findings30d")} value={stats.findings_30d} />
      </div>

      <div>
        <div className={SECTION_TITLE}>{t("stats.agentsUsing")}</div>
        {stats.agents.length === 0 ? (
          <div className={EMPTY_NOTE}>{t("stats.noAgents")}</div>
        ) : (
          stats.agents.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 border-b border-border py-2 text-[13.5px]">
              <span className="flex-1">{a.name}</span>
              <Link href={`/agents/${a.id}`} className="text-ui text-muted-foreground no-underline">
                {t("stats.openAgent")} <Icon.ExternalLink size={11} aria-hidden className="inline" />
              </Link>
            </div>
          ))
        )}
      </div>

      <div>
        <div className={SECTION_TITLE}>{t("stats.findingsByCategory")}</div>
        {stats.findings_by_category.length === 0 ? (
          <div className={EMPTY_NOTE}>{t("stats.noFindings")}</div>
        ) : (
          <Donut
            segments={stats.findings_by_category.map((c) => ({
              label: c.category,
              value: c.count,
              color: CATEGORY_COLOR[c.category as keyof typeof CATEGORY_COLOR] ?? FALLBACK_CATEGORY_COLOR,
            }))}
            valuePrefix=""
            valueFormat={(v) => String(Math.round(v))}
          />
        )}
      </div>
    </div>
  );
}
