"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import type { GroupMember } from "@devdigest/shared";
import { cn } from "@/lib/utils";

export interface AlsoFlaggedBadgeProps {
  /** The group's OTHER members (the card's own finding excluded). Renders nothing when empty. */
  members: GroupMember[];
  onAccept: (findingId: string) => void;
  onDismiss: (findingId: string) => void;
}

const WRAP = "min-w-0 break-words wrap-anywhere";

export function AlsoFlaggedBadge({ members, onAccept, onDismiss }: AlsoFlaggedBadgeProps) {
  const t = useTranslations("runs.multiAgent.alsoFlagged");
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();
  if (members.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        className={cn(
          "max-w-full cursor-pointer self-start rounded-full border border-border bg-muted px-2.5 py-0.75 text-left text-xs text-muted-foreground",
          WRAP,
        )}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {t("badge", { agents: members.map((m) => m.agent_name).join(", ") })}
      </button>
      {open && (
        <ul id={panelId} className="m-0 flex min-w-0 list-none flex-col gap-2.5 p-0">
          {members.map((m) => (
            <li key={m.finding_id} className={cn("flex flex-col gap-2 rounded-lg border border-border p-3 text-sm", WRAP)} data-testid="also-flagged-member">
              <span className={cn("text-xs text-subtle-foreground", WRAP)}>
                {t("memberSummary", {
                  agent: m.agent_name,
                  severity: m.severity,
                  pct: Math.round(m.confidence * 100),
                })}
              </span>
              <span className={cn("font-semibold text-foreground", WRAP)}>{m.title}</span>
              <span className={cn("mono text-xs text-muted-foreground", WRAP)}>{`${m.file}:${m.start_line}`}</span>
              <Markdown>{m.rationale}</Markdown>
              {m.suggestion ? (
                <div>
                  <div className="text-2xs font-semibold tracking-[0.06em] text-subtle-foreground uppercase">
                    {t("suggestedFix")}
                  </div>
                  <Markdown>{m.suggestion}</Markdown>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => onAccept(m.finding_id)}>
                  {t("accept")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onDismiss(m.finding_id)}>
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
