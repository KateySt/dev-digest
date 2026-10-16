/* TraceBody — the Trace tab content: Configuration, Stats, Findings, Prompt
   assembly, Tool calls, and Raw output sections for one persisted RunTrace. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import type { RunTrace, FindingRecord } from "@devdigest/shared";
import { formatRunCost } from "@/components/run-cost-badge";
import { PROMPT_DOT } from "../../constants";
import { formatSeconds, formatTokens } from "../../helpers";

const MUTED_NOTE = "text-sm text-subtle-foreground";
import { TraceSection } from "../TraceSection";
import { ToolCallRow } from "../ToolCallRow";
import { PromptBlock } from "../PromptBlock";
import { FindingsSection } from "../FindingsSection";
import { Row, Stat } from "../atoms";

export function TraceBody({ trace, findings }: { trace: RunTrace; findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  const stats = trace.stats;
  return (
    <>
      <TraceSection icon="Settings" title={t("trace.configuration")}>
        <div className="flex flex-col gap-2.5 text-sm">
          <Row label={t("trace.config.model")}>
            <span className="mono text-brand-text">
              {trace.config.model}
            </span>
          </Row>
          <Row label={t("trace.config.provider")}>
            <span className="mono text-muted-foreground">
              {trace.config.provider ?? "—"}
            </span>
          </Row>
          <Row label={t("trace.config.memoryPulled")}>
            <span>{t("trace.config.items", { count: trace.memory_pulled.length })}</span>
          </Row>
          <Row label={t("trace.config.specsRead")}>
            <div className="flex min-w-0 flex-col gap-1.5">
              {trace.specs_read.length === 0 ? (
                <span className="text-subtle-foreground">{t("trace.config.none")}</span>
              ) : (
                trace.specs_read.map((sp, i) => (
                  // A repo-relative path has no spaces: give it its own wrap room (client/INSIGHTS.md 2026-09-24).
                  <span key={i} className="flex min-w-0 items-baseline gap-2">
                    <span className="mono min-w-0 text-xs text-muted-foreground wrap-anywhere break-words">
                      {sp.path}
                    </span>
                    {sp.outcome !== "injected" && (
                      <span className="shrink-0 text-2xs font-semibold text-warn">
                        {t(`trace.config.specsReadReason.${sp.outcome}`)}
                      </span>
                    )}
                  </span>
                ))
              )}
            </div>
          </Row>
        </div>
      </TraceSection>

      <TraceSection
        icon="Gauge"
        title={t("trace.stats")}
        right={
          <Badge variant="ok">
            <Icon.Check aria-hidden />
            {trace.grounding
              ? t("trace.grounding.keptOfTotal", { kept: trace.grounding.kept, total: trace.grounding.total })
              : stats.grounding}
          </Badge>
        }
      >
        <div className="flex gap-2.5">
          <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
          <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
          <Stat label={t("trace.stat.cost")} val={stats.cost_usd != null ? formatRunCost(stats.cost_usd) : "—"} />
          <Stat label={t("trace.stat.findings")} val={stats.findings} />
        </div>
      </TraceSection>

      {trace.grounding && (
        <TraceSection icon="Check" title={t("trace.grounding.title")}>
          <div className="mb-2 text-sm font-semibold">
            {t("trace.grounding.keptOfTotal", { kept: trace.grounding.kept, total: trace.grounding.total })}
          </div>
          {trace.grounding.dropped.length === 0 ? (
            <span className={MUTED_NOTE}>{t("trace.grounding.noneDropped")}</span>
          ) : (
            <>
              <div className="mb-1.5 text-xs text-subtle-foreground">
                {t("trace.grounding.droppedTitle", { count: trace.grounding.dropped.length })}
              </div>
              {trace.grounding.dropped.map((d, i) => (
                <div key={i} className="border-t border-border py-2 whitespace-normal wrap-anywhere">
                  <div className="text-sm">{d.title}</div>
                  <div className="mono text-xs text-subtle-foreground wrap-anywhere">
                    {d.file}:{d.start_line}-{d.end_line}
                  </div>
                  <div className="text-xs text-muted-foreground">{t("trace.grounding.dropReason", { reason: d.reason })}</div>
                </div>
              ))}
            </>
          )}
        </TraceSection>
      )}

      <FindingsSection findings={findings} />

      <TraceSection icon="FileText" title={t("trace.promptAssembly")} defaultOpen={false}>
        <PromptBlock label={t("trace.prompt.system")} text={trace.prompt_assembly.system} dotClass={PROMPT_DOT.system} />
        {trace.prompt_assembly.skills != null && (
          <PromptBlock label={t("trace.prompt.skills")} text={trace.prompt_assembly.skills} dotClass={PROMPT_DOT.skills} />
        )}
        {trace.prompt_assembly.memory != null && (
          <PromptBlock label={t("trace.prompt.memory")} text={trace.prompt_assembly.memory} dotClass={PROMPT_DOT.memory} />
        )}
        {trace.prompt_assembly.repo_map != null && (
          <PromptBlock label={t("trace.prompt.repoMap")} text={trace.prompt_assembly.repo_map} dotClass={PROMPT_DOT.repoMap} />
        )}
        {/* SPEC-04 C-AC-23: PERMANENTLY present, unlike the sibling blocks
            above which are conditional on `!= null` — an older trace with no
            project-context data at all still renders this labeled block
            with the explicit empty copy (C-AC-25), never a missing field. */}
        <PromptBlock
          label={t("trace.prompt.specs")}
          text={trace.prompt_assembly.specs ?? t("trace.prompt.specsEmpty")}
          dotClass={PROMPT_DOT.specs}
        />
        {trace.prompt_assembly.callers != null && (
          <PromptBlock label={t("trace.prompt.callers")} text={trace.prompt_assembly.callers} dotClass={PROMPT_DOT.callers} />
        )}
        <PromptBlock label={t("trace.prompt.user")} text={trace.prompt_assembly.user} dotClass={PROMPT_DOT.user} />
      </TraceSection>

      <TraceSection
        icon="Wrench"
        title={t("trace.toolCalls")}
        right={<Badge variant="neutral">{trace.tool_calls.length}</Badge>}
      >
        {trace.tool_calls.length === 0 ? (
          <span className={MUTED_NOTE}>{t("trace.noToolCalls")}</span>
        ) : (
          trace.tool_calls.map((tc, i) => <ToolCallRow key={i} tc={tc} />)
        )}
      </TraceSection>

      <TraceSection icon="Code" title={t("trace.rawOutput")} defaultOpen={false}>
        <pre className="mono m-0 max-h-55 overflow-auto rounded-md bg-code-bg px-3.5 py-3 text-xs leading-normal whitespace-pre-wrap text-foreground">
          {trace.raw_output || "—"}
        </pre>
      </TraceSection>
    </>
  );
}
