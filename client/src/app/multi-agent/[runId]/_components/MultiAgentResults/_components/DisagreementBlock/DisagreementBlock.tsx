"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import type { ConflictTake, DisagreementRow } from "@devdigest/shared";
import { CELL_KEY, NEUTRAL_VERDICT_COLOR, VERDICT_COLOR, type NonSeverityVerdict } from "./constants";
import { filterRows } from "./helpers";
import { s } from "./styles";

export interface DisagreementBlockProps {
  rows: DisagreementRow[];
  onlyConflicts: boolean;
  onOnlyConflictsChange: (next: boolean) => void;
}

function Cell({ take }: { take: ConflictTake }) {
  const t = useTranslations("runs.multiAgent.disagree.cell");
  const flagged = take.verdict in VERDICT_COLOR;
  const label = flagged ? take.verdict : t(CELL_KEY[take.verdict as NonSeverityVerdict]);
  return (
    <div style={s.cell} data-testid="disagree-cell">
      <span style={s.agent}>{take.agent_name}</span>
      <span style={{ ...s.verdict, color: flagged ? VERDICT_COLOR[take.verdict] : NEUTRAL_VERDICT_COLOR }}>
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
    <section style={s.root} aria-labelledby={titleId}>
      <div style={s.header}>
        <h3 id={titleId} style={s.title}>
          {t("title")}
        </h3>
        <label style={s.toggleLabel}>
          {t("onlyConflicts")}
          <Toggle on={onlyConflicts} onChange={onOnlyConflictsChange} />
        </label>
      </div>
      {rows.length === 0 ? (
        <p style={s.empty}>{t("emptyNoFindings")}</p>
      ) : visible.length === 0 ? (
        <p style={s.empty}>{t("emptyNoConflicts")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((row) => (
            <li key={row.group_id} style={s.row} data-testid="disagree-row">
              <div style={s.rowLabel}>
                <span className="mono" style={s.location}>{`${row.file}:${row.start_line}`}</span>
                <span style={{ minWidth: 0 }}>{row.title}</span>
              </div>
              <div style={s.cells}>
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
