"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalDashboardSkill, SkillEvalDashboardRun, SkillType } from "@devdigest/shared";
import { MetricBar, MetricValue, RunStatusChip } from "@/components/eval-metrics";
import { useEvalSkillsDashboard, useRunAllSkills } from "@/lib/hooks/eval-dashboard";
import { useSkills } from "@/lib/hooks/skills";
import { METRICS, formatRanAt, runVersion } from "@/lib/eval";
import { SKILL_TYPE_COLOR } from "@/lib/skill-constants";
import { s } from "../../styles";

const SHORT_LABEL = { recall: "recall", precision: "precision", citation_accuracy: "citation" } as const;

/** Skills tab of the Eval Dashboard (`/eval?tab=skills`): one row per skill
 *  (latest finished run, sparkline, recall/prec/cite, running state), "Run all
 *  skills" with a skipped-count notice, and the recent suite runs across
 *  skills. Polls (via the hook) while any skill runs. The type badge is joined
 *  client-side from the skills list (the dashboard payload has no type). */
export function SkillsOverview() {
  const t = useTranslations("evalDashboard");
  const { data, isLoading, isError, refetch } = useEvalSkillsDashboard();
  const { data: skillList } = useSkills();
  const runAll = useRunAllSkills();
  const typeById = new Map<string, SkillType>((skillList ?? []).map((sk) => [sk.id, sk.type]));
  const eligible = (data?.skills ?? []).some((sk) => sk.cases_total > 0);
  const anyRunning = (data?.skills ?? []).some((sk) => sk.running_run);

  return (
    <>
      <div style={s.header}>
        <div style={s.headerText}>
          <h1 style={s.h1}>{t("title")}</h1>
          <p style={s.subtitle}>{t("skills.subtitle")}</p>
        </div>
        <Button
          kind="primary"
          icon="Play"
          onClick={() => runAll.mutate()}
          disabled={runAll.isPending || anyRunning || !eligible}
        >
          {runAll.isPending ? t("skills.runAllStarting") : t("skills.runAll")}
        </Button>
      </div>
      {runAll.data && (
        <div role="status" style={s.notice}>
          {t("skills.runAllResult", { started: runAll.data.started.length, skipped: runAll.data.skipped.length })}
        </div>
      )}

      {isLoading && (
        <>
          <Skeleton height={90} />
          <Skeleton height={160} />
        </>
      )}
      {isError && <ErrorState body={t("loadFailed")} onRetry={() => refetch()} />}

      {data && (
        <>
          <h2 style={s.sectionLabel}>
            <Icon.Sparkles size={14} />
            {t("skills.title")}
          </h2>
          {data.skills.length === 0 ? (
            <EmptyState icon="FlaskConical" title={t("title")} body={t("skills.noSkills")} />
          ) : (
            <div style={s.agentList}>
              {data.skills.map((sk) => (
                <SkillRow key={sk.skill_id} skill={sk} type={typeById.get(sk.skill_id)} />
              ))}
            </div>
          )}

          <h2 style={s.sectionLabel}>
            <Icon.History size={14} />
            {t("skills.recentTitle")}
          </h2>
          <div style={s.tableWrap}>
            {data.recent_runs.length === 0 ? (
              <div style={s.muted}>{t("skills.recentEmpty")}</div>
            ) : (
              <RecentRunsTable runs={data.recent_runs} />
            )}
          </div>
        </>
      )}
    </>
  );
}

function SkillRow({ skill, type }: { skill: EvalDashboardSkill; type: SkillType | undefined }) {
  const t = useTranslations("evalDashboard");
  const ts = useTranslations("skills");
  const run = skill.latest_run;
  const sparkData = skill.history.map((h) => h.recall).filter((v): v is number => v != null);
  const version = run ? runVersion(run) : null;

  return (
    <Link href={`/eval/skills/${skill.skill_id}`} style={s.agentCard} aria-label={t("skills.open", { name: skill.skill_name })}>
      <span style={s.iconTile}>
        <Icon.Sparkles size={18} />
      </span>
      <div style={s.agentMain}>
        <div style={s.agentTitleRow}>
          <span className="mono" style={s.agentName}>
            {skill.skill_name}
          </span>
          {type && <Badge color={SKILL_TYPE_COLOR[type]}>{ts(`listItem.type.${type}`)}</Badge>}
        </div>
        <div style={s.agentMeta}>
          {skill.running_run ? (
            <span style={s.runningNote}>
              {t("skills.running", { done: skill.running_run.cases_done, total: skill.running_run.cases_total })}
            </span>
          ) : skill.cases_total === 0 ? (
            t("skills.noCases")
          ) : run ? (
            t("skills.lastRun", {
              version: version ?? "?",
              ranAt: formatRanAt(run.started_at),
              passed: run.passed_count,
              evaluated: run.evaluated_count,
            })
          ) : (
            t("skills.neverRun")
          )}
        </div>
      </div>
      {sparkData.length > 0 && (
        <span style={s.sparkWrap}>
          <Sparkline data={sparkData} color="var(--accent)" w={84} h={28} />
        </span>
      )}
      <div style={s.metrics}>
        {METRICS.map((m) => (
          <div key={m.key} style={s.metric}>
            <span style={s.metricLabel}>{t(`agents.${SHORT_LABEL[m.key]}`)}</span>
            <MetricValue value={run?.[m.key] ?? null} color={m.color} size={22} />
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
    </Link>
  );
}

function RecentRunsTable({ runs }: { runs: SkillEvalDashboardRun[] }) {
  const t = useTranslations("evalDashboard");
  const cols = ["skill", "ranAt", "version", "recall", "precision", "citation", "pass"] as const;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} scope="col" style={s.th}>
              {t(`skills.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="mono" style={{ ...s.td, ...s.tdAgent }}>
              {r.skill_name}
            </td>
            <td className="mono" style={s.td}>
              {formatRanAt(r.started_at)}
            </td>
            <td className="mono" style={{ ...s.td, color: "var(--accent)" }}>
              v{runVersion(r) ?? "?"}
            </td>
            {METRICS.map((m) => (
              <td key={m.key} style={s.td}>
                <MetricBar value={r[m.key]} color={m.color} barWidth={72} />
              </td>
            ))}
            <td className="tnum" style={{ ...s.td, fontWeight: 700, color: "var(--text-primary)" }}>
              {r.status === "completed" ? `${r.passed_count}/${r.evaluated_count}` : <RunStatusChip status={r.status} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
