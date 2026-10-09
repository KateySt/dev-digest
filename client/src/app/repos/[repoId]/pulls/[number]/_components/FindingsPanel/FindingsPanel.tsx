/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useLinkedSkills } from "@/lib/hooks/agents";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { countBySeverity } from "../../../../../../../lib/findings";
import { KEY_TO_ACTION, SEVERITY_FILTER_ORDER } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

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

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.severityGroup}>
          <Chip
            active={severityFilter === null}
            count={confidenceFiltered.length}
            onClick={() => setSeverityFilter(null)}
          >
            {t("panel.all")}
          </Chip>
          {SEVERITY_FILTER_ORDER.filter((sev) => severityCounts[sev] > 0).map((sev) => (
            <Chip
              key={sev}
              icon={SEV[sev].icon}
              color={SEV[sev].c}
              count={severityCounts[sev]}
              active={severityFilter === sev}
              onClick={() => setSeverityFilter(sev)}
            >
              {SEV[sev].label}
            </Chip>
          ))}
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
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
