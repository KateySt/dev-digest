"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { collapseDiff, lineDiff, type DiffLineKind } from "@/lib/eval";
import { cn } from "@/lib/utils";
import { SECTION_LABEL, WRAP } from "../../constants";

const LINE: Record<DiffLineKind, string> = {
  same: "text-muted-foreground",
  add: "bg-ok-bg text-foreground",
  del: "bg-crit-bg text-foreground line-through",
};

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
      <div className={cn(SECTION_LABEL, "mb-2.5")}>
        <Icon.FileText size={14} aria-hidden />
        {title}
      </div>
      <div className="mb-2.5 flex gap-4 text-ui text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-xs bg-crit-bg" />
          {oldLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-xs bg-ok-bg" />
          {newLabel}
        </span>
      </div>
      <div className="mono min-w-0 rounded-lg border border-border bg-surface py-2.5 text-sm leading-[1.6]">
        {diff.map((l, i) =>
          l.kind === "skip" ? (
            <div key={i} className="px-3.5 py-0.5 text-xs text-subtle-foreground italic">
              {t("compare.unchangedLines", { count: l.count })}
            </div>
          ) : (
            <div
              key={i}
              data-kind={l.kind}
              className={cn("flex gap-2.5 px-3.5 whitespace-pre-wrap", WRAP, LINE[l.kind])}
            >
              <span className="w-2.5 shrink-0 text-subtle-foreground no-underline">
                {l.kind === "add" ? t("compare.addedMark") : l.kind === "del" ? t("compare.removedMark") : ""}
              </span>
              <span className="min-w-0">{l.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
