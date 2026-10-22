/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FindingRecord } from "@devdigest/shared";
import { TraceSection } from "../TraceSection";

const SEV_TEXT: Record<string, string> = {
  CRITICAL: "text-crit",
  WARNING: "text-warn",
  SUGGESTION: "text-primary",
};

export function FindingsSection({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge variant="neutral">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span className="text-sm text-subtle-foreground">{t("trace.noFindings")}</span>
      ) : (
        <div className="flex flex-col gap-2.5">
          {findings.map((f) => (
            <div key={f.id} className="rounded-lg border border-border bg-surface px-3 py-2.5">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant="ghost" className={cn("px-0", SEV_TEXT[f.severity] ?? "text-subtle-foreground")}>
                  {f.severity}
                </Badge>
                <span className="text-sm font-semibold">{f.title}</span>
              </div>
              <div className="mono mb-1.5 text-[11.5px] text-subtle-foreground">
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </div>
              <div className="text-ui leading-normal text-muted-foreground">
                {f.rationale}
              </div>
              {f.suggestion && (
                <div className="mt-1.5 text-ui leading-normal text-muted-foreground">
                  <strong>{t("trace.suggestedFix")} </strong>
                  {f.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TraceSection>
  );
}
