/* RiskAreasList — the "Risk Areas" block on the PR Overview tab: an
   accordion of risk rows (icon+color by kind — see ./constants) where each
   row expands independently, inline, directly under itself; multiple rows
   can be open at once. Follows the same Set<string> toggle pattern as
   BlastTree.tsx (`.../BlastRadiusPanel/_components/BlastTree`). Clicking a
   file ref (in the row preview OR its own expanded detail) jumps to that
   file:line on the Files-changed tab — DiffTab renders every risk's
   annotation inline on its own (see `buildRiskAnnotations`), so this jump is
   scroll+highlight only, not a data handoff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink } from "@devdigest/ui";
import { useRisks } from "@/lib/hooks/reviews";
import { parseFileRef } from "@/components/diff-viewer";
import { KIND_ICON, KIND_COLOR, type RiskKind } from "./constants";
import { s } from "./styles";

export function RiskAreasList({
  prId,
  onNavigateToFile,
}: {
  prId: string | null | undefined;
  onNavigateToFile: (path: string, line: number) => void;
}) {
  const t = useTranslations("brief");
  const { data, isLoading } = useRisks(prId);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) return null;

  const risks = data?.risks ?? [];
  if (risks.length === 0) {
    return <div style={s.placeholderHint}>{t("noRisks")}</div>;
  }

  return (
    <div style={s.wrap}>
      {risks.map((risk, i) => {
        const kind = (risk.kind in KIND_ICON ? risk.kind : "other") as RiskKind;
        const color = KIND_COLOR[kind];
        const IconComp = Icon[KIND_ICON[kind]];
        // Title+kind is stable across re-fetches of the same review; index is
        // only a tiebreaker for the (rare) case of two risks sharing both.
        const key = `${risk.kind}:${risk.title}:${i}`;
        const isOpen = expanded.has(key);
        const firstRef = risk.file_refs[0];
        const firstTarget = firstRef ? parseFileRef(firstRef) : null;

        return (
          <div key={key}>
            <div
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggle(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") toggle(key);
              }}
              style={s.card(isOpen, color)}
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
              <Icon.ChevronDown size={14} style={s.chevron(isOpen)} />
            </div>

            {isOpen && (
              <div style={s.detail}>
                <p style={s.detailText}>{risk.explanation}</p>
                <div style={s.detailRefs}>
                  {risk.file_refs.map((ref, ri) => {
                    const target = parseFileRef(ref);
                    return (
                      <div key={ri} style={s.detailRefItem}>
                        <MonoLink
                          onClick={target ? () => onNavigateToFile(target.path, target.line) : undefined}
                        >
                          {ref}
                        </MonoLink>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
