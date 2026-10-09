"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { collapseDiff, lineDiff } from "@/lib/eval";
import { s } from "../../styles";

/** Titled line diff of two texts (system prompts, skill text): removed lines
 *  struck through, added lines highlighted, long unchanged runs collapsed.
 *  Everything is rendered as plain TEXT — never HTML/markdown. The caller
 *  supplies the heading and the old/new legend labels. */
export function TextDiffBlock({
  title,
  oldText,
  newText,
  oldLabel,
  newLabel,
}: {
  title: string;
  oldText: string;
  newText: string;
  oldLabel: string;
  newLabel: string;
}) {
  const t = useTranslations("evalMetrics");
  const diff = React.useMemo(() => collapseDiff(lineDiff(oldText, newText)), [oldText, newText]);
  return (
    <div>
      <div style={s.compareSectionLabel}>
        <Icon.FileText size={14} />
        {title}
      </div>
      <div style={s.diffLegend}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={s.swatch("var(--crit-bg, rgba(239,68,68,0.3))")} />
          {oldLabel}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={s.swatch("var(--ok-bg, rgba(16,185,129,0.3))")} />
          {newLabel}
        </span>
      </div>
      <div className="mono" style={s.diffBlock}>
        {diff.map((l, i) =>
          l.kind === "skip" ? (
            <div key={i} style={s.diffSkip}>
              {t("compare.unchangedLines", { count: l.count })}
            </div>
          ) : (
            <div key={i} style={s.diffLine(l.kind)}>
              <span style={s.diffMark}>{l.kind === "add" ? t("compare.addedMark") : l.kind === "del" ? t("compare.removedMark") : ""}</span>
              <span style={{ minWidth: 0 }}>{l.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
