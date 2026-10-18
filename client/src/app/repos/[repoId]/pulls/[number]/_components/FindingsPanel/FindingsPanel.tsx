/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { useCommand } from "@/components/keyboard";
import { FilterChip } from "@/components/filter-chip";
import { SEVERITY_STYLE } from "@/components/severity";
import { Switch } from "@/components/ui/switch";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { useLinkedSkills } from "@/lib/hooks/agents";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { countBySeverity } from "../../../../../../../lib/findings";
import { SEVERITY_FILTER_ORDER } from "./constants";
import { visibleFindings } from "./helpers";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  targetFindingId,
  agentId,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Deep-linked finding (e.g. from the PR-list tooltip) — expanded and
   *  keyboard-focused on mount instead of the usual first row. */
  targetFindingId?: string | null;
  /** The review's agent (null for agentless reviews) — gates "Turn into eval case". */
  agentId?: string | null;
}) {
  const t = useTranslations("prReview");
  const tSev = useTranslations("common.severity");
  const action = useFindingAction();
  const linkedSkills = useLinkedSkills(agentId);
  const [hideLow, setHideLow] = React.useState(false);
  const [severityFilter, setSeverityFilter] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(() => {
    if (!targetFindingId) return 0;
    const idx = visibleFindings(findings, false).findIndex((f) => f.id === targetFindingId);
    return idx >= 0 ? idx : 0;
  });

  const confidenceFiltered = React.useMemo(
    () => visibleFindings(findings, hideLow),
    [findings, hideLow],
  );
  const severityCounts = React.useMemo(
    () => countBySeverity(confidenceFiltered),
    [confidenceFiltered],
  );
  const shown = React.useMemo(
    () =>
      severityFilter
        ? confidenceFiltered.filter((f) => f.severity === severityFilter)
        : confidenceFiltered,
    [confidenceFiltered, severityFilter],
  );

  // A narrower filter can leave focus pointing past the end (or at a card
  // that's no longer shown) — snap back to the first visible card.
  React.useEffect(() => {
    setFocusIdx(0);
  }, [severityFilter]);

  const lastTargetRef = React.useRef<string | null>(targetFindingId ?? null);
  React.useEffect(() => {
    if (!targetFindingId || lastTargetRef.current === targetFindingId) return;
    lastTargetRef.current = targetFindingId;
    const idx = shown.findIndex((f) => f.id === targetFindingId);
    if (idx >= 0) setFocusIdx(idx);
  }, [targetFindingId, shown]);

  // Next/previous + accept/dismiss on the focused finding — keyboard commands
  // from the registry (j/k/a/d by default, rebindable, layout-independent).
  const act = (kind: "accept" | "dismiss") => {
    const f = shown[focusIdx];
    if (f) action.mutate({ findingId: f.id, action: kind, prId });
  };
  useCommand("findings.next", () => setFocusIdx((i) => Math.min(i + 1, shown.length - 1)));
  useCommand("findings.prev", () => setFocusIdx((i) => Math.max(i - 1, 0)));
  useCommand("findings.accept", () => act("accept"));
  useCommand("findings.dismiss", () => act("dismiss"));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={severityFilter === null}
            count={confidenceFiltered.length}
            onClick={() => setSeverityFilter(null)}
          >
            {t("panel.all")}
          </FilterChip>
          {SEVERITY_FILTER_ORDER.filter((sev) => severityCounts[sev] > 0).map((sev) => (
            <FilterChip
              key={sev}
              icon={SEVERITY_STYLE[sev].icon}
              iconClassName={SEVERITY_STYLE[sev].text}
              count={severityCounts[sev]}
              active={severityFilter === sev}
              onClick={() => setSeverityFilter(sev)}
            >
              {tSev(sev)}
            </FilterChip>
          ))}
        </div>
        <label className="ml-auto flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
          {t("panel.hideLowConfidence")}
          <Switch checked={hideLow} onCheckedChange={setHideLow} />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id === targetFindingId ? `${f.id}:target` : f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0 || f.id === targetFindingId}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              prId={prId}
              agentId={agentId}
              linkedSkills={linkedSkills}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
