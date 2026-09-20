"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { CircularScore, Donut, EmptyState, ErrorState, Icon, MetricCard, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { CATEGORY_COLOR, FALLBACK_CATEGORY_COLOR } from "./constants";
import { s } from "./styles";

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
      <div style={s.wrap}>
        <div style={s.tileRow}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
        <Skeleton height={160} />
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
    <div style={s.wrap}>
      <div style={s.tileRow}>
        <MetricCard label={t("stats.tiles.usedBy")} value={stats.used_by_agents} />
        <MetricCard
          label={t("stats.tiles.pullFrequency")}
          value={pullPct ?? "—"}
          suffix={pullPct != null ? "%" : undefined}
        />
        <div style={s.acceptRateTile}>
          <CircularScore score={acceptPct ?? 0} size={44} />
          <div>
            <div style={s.acceptRateLabel}>{t("stats.tiles.acceptRate")}</div>
            <div className="tnum" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
              {acceptPct != null ? `${acceptPct}%` : "—"}
            </div>
          </div>
        </div>
        <MetricCard label={t("stats.tiles.findings30d")} value={stats.findings_30d} />
      </div>

      <div>
        <div style={s.sectionTitle}>{t("stats.agentsUsing")}</div>
        {stats.agents.length === 0 ? (
          <div style={s.emptyNote}>{t("stats.noAgents")}</div>
        ) : (
          stats.agents.map((a) => (
            <div key={a.id} style={s.agentRow}>
              <span style={s.agentName}>{a.name}</span>
              <Link href={`/agents/${a.id}`} style={s.openLink}>
                {t("stats.openAgent")} <Icon.ExternalLink size={11} />
              </Link>
            </div>
          ))
        )}
      </div>

      <div>
        <div style={s.sectionTitle}>{t("stats.findingsByCategory")}</div>
        {stats.findings_by_category.length === 0 ? (
          <div style={s.emptyNote}>{t("stats.noFindings")}</div>
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
