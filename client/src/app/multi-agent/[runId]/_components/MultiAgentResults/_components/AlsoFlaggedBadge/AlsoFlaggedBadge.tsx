"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Markdown } from "@devdigest/ui";
import type { GroupMember } from "@devdigest/shared";
import { s } from "./styles";

export interface AlsoFlaggedBadgeProps {
  /** The group's OTHER members (the card's own finding excluded). Renders nothing when empty. */
  members: GroupMember[];
  onAccept: (findingId: string) => void;
  onDismiss: (findingId: string) => void;
}

export function AlsoFlaggedBadge({ members, onAccept, onDismiss }: AlsoFlaggedBadgeProps) {
  const t = useTranslations("runs.multiAgent.alsoFlagged");
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  if (members.length === 0) return null;

  return (
    <div style={s.root}>
      <button
        type="button"
        style={s.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {t("badge", { agents: members.map((m) => m.agent_name).join(", ") })}
      </button>
      {open && (
        <ul id={panelId} style={s.list}>
          {members.map((m) => (
            <li key={m.finding_id} style={s.member} data-testid="also-flagged-member">
              <span style={s.summary}>
                {t("memberSummary", {
                  agent: m.agent_name,
                  severity: m.severity,
                  pct: Math.round(m.confidence * 100),
                })}
              </span>
              <span style={s.memberTitle}>{m.title}</span>
              <span className="mono" style={s.location}>{`${m.file}:${m.start_line}`}</span>
              <Markdown>{m.rationale}</Markdown>
              {m.suggestion ? (
                <div>
                  <div style={s.sugHeading}>{t("suggestedFix")}</div>
                  <Markdown>{m.suggestion}</Markdown>
                </div>
              ) : null}
              <div style={s.actions}>
                <Button size="sm" onClick={() => onAccept(m.finding_id)}>
                  {t("accept")}
                </Button>
                <Button size="sm" onClick={() => onDismiss(m.finding_id)}>
                  {t("dismiss")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
