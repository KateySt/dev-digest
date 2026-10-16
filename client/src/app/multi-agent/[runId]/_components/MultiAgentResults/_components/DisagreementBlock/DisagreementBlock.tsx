"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ConflictTake, DisagreementRow } from "@devdigest/shared";
import { CELL_KEY, NEUTRAL_VERDICT_CLASS, VERDICT_CLASS, type NonSeverityVerdict } from "./constants";
import { filterRows } from "./helpers";

export interface DisagreementBlockProps {
  rows: DisagreementRow[];
  onlyConflicts: boolean;
  onOnlyConflictsChange: (next: boolean) => void;
}

/** Long file paths / titles must wrap, never push the grid past the page edge. */
const WRAP = "min-w-0 break-words wrap-anywhere";
const EMPTY = "m-0 text-sm text-subtle-foreground";

function Cell({ take }: { take: ConflictTake }) {
  const t = useTranslations("runs.multiAgent.disagree.cell");
  const flagged = take.verdict in VERDICT_CLASS;
  const label = flagged ? take.verdict : t(CELL_KEY[take.verdict as NonSeverityVerdict]);
  return (
    <div
      className={cn("flex flex-col gap-1 border-r border-border px-3.5 py-2.5 text-ui", WRAP)}
      data-testid="disagree-cell"
    >
      <span className={cn("font-semibold text-foreground", WRAP)}>{take.agent_name}</span>
      <span
        data-verdict={take.verdict}
        className={cn(
          "text-xs font-semibold tracking-[0.04em] uppercase",
          flagged ? VERDICT_CLASS[take.verdict] : NEUTRAL_VERDICT_CLASS,
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function DisagreementBlock({ rows, onlyConflicts, onOnlyConflictsChange }: DisagreementBlockProps) {
  const t = useTranslations("runs.multiAgent.disagree");
  const visible = filterRows(rows, onlyConflicts);
  const titleId = React.useId();

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="m-0 text-[11.5px] font-semibold tracking-[0.08em] text-subtle-foreground">
          {t("title")}
        </h3>
        <label className="inline-flex items-center gap-2 text-ui text-muted-foreground">
          {t("onlyConflicts")}
          <Switch checked={onlyConflicts} onCheckedChange={onOnlyConflictsChange} />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className={EMPTY}>{t("emptyNoFindings")}</p>
      ) : visible.length === 0 ? (
        <p className={EMPTY}>{t("emptyNoConflicts")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {visible.map((row) => (
            <li key={row.group_id} className="min-w-0 overflow-hidden rounded-lg border border-border bg-elevated" data-testid="disagree-row">
              <div className={cn("flex flex-wrap gap-2.5 border-b border-border px-3.5 py-2.5 text-sm", WRAP)}>
                <span className={cn("mono text-ui text-muted-foreground", WRAP)}>{`${row.file}:${row.start_line}`}</span>
                <span className="min-w-0">{row.title}</span>
              </div>
              <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
                {row.takes.map((take) => (
                  <Cell key={take.agent_id} take={take} />
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
