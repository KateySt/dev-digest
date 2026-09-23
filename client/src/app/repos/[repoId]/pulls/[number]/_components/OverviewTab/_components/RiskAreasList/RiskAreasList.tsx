/* RiskAreasList — the "Risk areas" block on the PR Overview tab: a list of
   selectable risk cards (icon by kind, colored by severity) with a shared
   detail panel below showing the selected risk's explanation + file refs.
   Clicking a file ref (in the card preview OR the detail panel) jumps to
   that file:line on the Files-changed tab — DiffTab renders every risk's
   annotation inline on its own (see `buildRiskAnnotations`), so this jump is
   scroll+highlight only, not a data handoff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink, type IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";
import { useRisks } from "@/lib/hooks/reviews";
import { parseFileRef } from "@/components/diff-viewer";
import { s } from "./styles";

const KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  reliability: "Activity",
  other: "AlertOctagon",
};

const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

export function RiskAreasList({
  prId,
  onNavigateToFile,
}: {
  prId: string | null | undefined;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  const { data, isLoading } = useRisks(prId);
  const [selected, setSelected] = React.useState(0);

  if (isLoading) return null;

  const risks = data?.risks ?? [];
  if (risks.length === 0) {
    return <div style={s.placeholderHint}>{t("noRisks")}</div>;
  }

  const activeIndex = Math.min(selected, risks.length - 1);
  const active = risks[activeIndex];

  return (
    <div style={s.wrap}>
      {risks.map((risk, i) => {
        const IconComp = Icon[KIND_ICON[risk.kind] ?? "AlertOctagon"];
        const isSelected = i === activeIndex;
        const color = SEVERITY_COLOR[risk.severity];
        const firstRef = risk.file_refs[0];
        const firstTarget = firstRef ? parseFileRef(firstRef) : null;
        return (
          <div
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSelected(i);
            }}
            style={s.card(isSelected, color)}
          >
            <span style={s.iconBox(color)}>
              <IconComp size={14} />
            </span>
            <span style={s.cardBody}>
              <span style={s.cardTitle}>{risk.title}</span>
              {firstRef && (
                <span style={s.cardRef}>
                  {firstTarget ? (
                    <MonoLink
                      onClick={(e?: React.MouseEvent) => {
                        e?.stopPropagation();
                        onNavigateToFile(firstTarget.path, firstTarget.line);
                      }}
                    >
                      {firstRef}
                    </MonoLink>
                  ) : (
                    <span className="mono">{firstRef}</span>
                  )}
                </span>
              )}
            </span>
            <Icon.ChevronDown size={14} style={s.chevron(isSelected)} />
          </div>
        );
      })}

      {active && (
        <div style={s.detail}>
          <p style={s.detailText}>{active.explanation}</p>
          <div style={s.detailRefs}>
            {active.file_refs.map((ref, i) => {
              const target = parseFileRef(ref);
              return (
                <MonoLink
                  key={i}
                  onClick={target ? () => onNavigateToFile(target.path, target.line) : undefined}
                >
                  {ref}
                </MonoLink>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
