"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkline } from "@/components/charts";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { EvalDashboardSkill, SkillEvalDashboardRun, SkillType } from "@devdigest/shared";
import { MetricBar, MetricValue, RunStatusChip } from "@/components/eval-metrics";
import { useEvalSkillsDashboard, useRunAllSkills } from "@/lib/hooks/eval-dashboard";
import { useSkills } from "@/lib/hooks/skills";
import { METRICS, formatRanAt, runVersion } from "@/lib/eval";
import { SKILL_TYPE_BADGE } from "@/lib/skill-constants";
import { cn } from "@/lib/utils";
import { C } from "../../constants";

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
      <div className={C.header}>
        <div className={C.headerText}>
          <h1 className={C.h1}>{t("title")}</h1>
          <p className={C.subtitle}>{t("skills.subtitle")}</p>
        </div>
        <Button onClick={() => runAll.mutate()} disabled={runAll.isPending || anyRunning || !eligible}>
          <Icon.Play aria-hidden />
          {runAll.isPending ? t("skills.runAllStarting") : t("skills.runAll")}
        </Button>
      </div>
      {runAll.data && (
        <div role="status" className={C.notice}>
          {t("skills.runAllResult", { started: runAll.data.started.length, skipped: runAll.data.skipped.length })}
        </div>
      )}

      {isLoading && (
        <>
          <Skeleton className="h-22.5 w-full" />
          <Skeleton className="h-40 w-full" />
        </>
      )}
      {isError && <ErrorState body={t("loadFailed")} onRetry={() => refetch()} />}

      {data && (
        <>
          <h2 className={C.sectionLabel}>
            <Icon.Sparkles size={14} aria-hidden />
            {t("skills.title")}
          </h2>
          {data.skills.length === 0 ? (
            <EmptyState icon="FlaskConical" title={t("title")} body={t("skills.noSkills")} />
          ) : (
            <div className={C.list}>
              {data.skills.map((sk) => (
                <SkillRow key={sk.skill_id} skill={sk} type={typeById.get(sk.skill_id)} />
              ))}
            </div>
          )}

          <h2 className={C.sectionLabel}>
            <Icon.History size={14} aria-hidden />
            {t("skills.recentTitle")}
          </h2>
          <div className={C.tableWrap}>
            {data.recent_runs.length === 0 ? (
              <div className={C.muted}>{t("skills.recentEmpty")}</div>
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
    <Link href={`/eval/skills/${skill.skill_id}`} className={C.card} aria-label={t("skills.open", { name: skill.skill_name })}>
      <span className={C.iconTile}>
        <Icon.Sparkles size={18} aria-hidden />
      </span>
      <div className={C.main}>
        <div className={C.titleRow}>
          <span className={cn("mono", C.name)}>
            {skill.skill_name}
          </span>
          {type && <Badge variant={SKILL_TYPE_BADGE[type]}>{ts(`listItem.type.${type}`)}</Badge>}
        </div>
        <div className={C.meta}>
          {skill.running_run ? (
            <span className={C.runningNote}>
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
        <span className={C.sparkWrap}>
          <Sparkline data={sparkData} color="var(--accent)" w={84} h={28} />
        </span>
      )}
      <div className={C.metrics}>
        {METRICS.map((m) => (
          <div key={m.key} className={C.metric}>
            <span className={C.metricLabel}>{t(`agents.${SHORT_LABEL[m.key]}`)}</span>
            <MetricValue value={run?.[m.key] ?? null} metric={m.key} size={22} />
          </div>
        ))}
      </div>
      <Icon.ChevronRight size={16} className={C.chevron} aria-hidden />
    </Link>
  );
}

function RecentRunsTable({ runs }: { runs: SkillEvalDashboardRun[] }) {
  const t = useTranslations("evalDashboard");
  const cols = ["skill", "ranAt", "version", "recall", "precision", "citation", "pass"] as const;
  return (
    <table className={C.table}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} scope="col" className={C.th}>
              {t(`skills.columns.${c}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className={cn("mono", C.td, C.tdName)}>
              {r.skill_name}
            </td>
            <td className={cn("mono", C.td)}>
              {formatRanAt(r.started_at)}
            </td>
            <td className={cn("mono", C.td, C.tdVersion)}>
              v{runVersion(r) ?? "?"}
            </td>
            {METRICS.map((m) => (
              <td key={m.key} className={C.td}>
                <MetricBar value={r[m.key]} metric={m.key} barWidth={72} />
              </td>
            ))}
            <td className={cn("tnum", C.td, C.tdPass)}>
              {r.status === "completed" ? `${r.passed_count}/${r.evaluated_count}` : <RunStatusChip status={r.status} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
