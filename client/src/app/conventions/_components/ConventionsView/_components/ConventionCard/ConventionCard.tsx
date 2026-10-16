"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CONVENTION_CATEGORY_TONE } from "../../constants";

/** One convention candidate. A "ready" card gets a selection checkbox
 *  (`selected` + `onToggleSelected`); a card already used in a skill shows
 *  Unlink instead of Accept/Reject (SPEC-2026-10-16-convention-skills AC-20). */
export function ConventionCard({
  candidate,
  onAccept,
  onReject,
  onUnlink,
  onSaveRule,
  selected,
  onToggleSelected,
  busy,
}: {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  onUnlink?: () => void;
  onSaveRule: (rule: string) => void;
  /** Present only on selectable ("ready") cards. */
  selected?: boolean;
  onToggleSelected?: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);

  React.useEffect(() => {
    if (!editing) setDraft(candidate.rule);
  }, [candidate.rule, editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== candidate.rule) onSaveRule(trimmed);
    setEditing(false);
  };

  const isAccepted = candidate.status === "accepted";
  const isRejected = candidate.status === "rejected";
  const isUsed = candidate.skill !== null;
  const confidence = Math.round(Math.max(0, Math.min(100, candidate.confidence * 100)));

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border border-l-3 border-border bg-elevated p-(--card-pad)",
        isAccepted && "border-l-ok",
        isRejected && "border-l-failed opacity-65",
      )}
    >
      <div className="flex items-start gap-3">
        {onToggleSelected && (
          <Checkbox
            className="mt-0.5"
            checked={!!selected}
            onCheckedChange={onToggleSelected}
            aria-label={t("selection.select", { rule: candidate.rule })}
          />
        )}
        {editing ? (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
        ) : (
          <div className="flex-1 text-md leading-[1.4] font-semibold">{candidate.rule}</div>
        )}
        {!editing && isUsed && onUnlink && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onUnlink}
              disabled={busy}
              title={t("card.unlinkHint")}
              aria-label={`${t("card.unlink")}: ${candidate.rule}`}
            >
              <Icon.X aria-hidden />
              {t("card.unlink")}
            </Button>
          </div>
        )}
        {!editing && !isUsed && (
          <div className="flex shrink-0 gap-2">
            <Button
              variant={isAccepted ? "default" : "secondary"}
              size="sm"
              onClick={onAccept}
              disabled={busy || isAccepted}
              aria-label={`${isAccepted ? t("card.accepted") : t("card.accept")}: ${candidate.rule}`}
            >
              {isAccepted && <Icon.Check aria-hidden />}
              {isAccepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onReject}
              disabled={busy || isRejected}
              aria-label={`${t("card.reject")}: ${candidate.rule}`}
            >
              {t("card.reject")}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Badge variant={CONVENTION_CATEGORY_TONE[candidate.category]}>{t(`card.category.${candidate.category}`)}</Badge>
        <span className="mono text-xs text-subtle-foreground">
          {candidate.evidence_path}
          {candidate.evidence_line != null ? `:${candidate.evidence_line}` : ""}
        </span>
      </div>

      {candidate.rationale && <div className="text-sm text-muted-foreground italic">{candidate.rationale}</div>}

      <pre className="mono m-0 overflow-auto rounded-[7px] bg-accent p-2.5 text-xs break-words whitespace-pre-wrap">
        {candidate.evidence_snippet}
      </pre>

      <div className="flex items-center justify-between gap-3">
        <div className="flex max-w-55 flex-1 flex-col gap-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <span className="flex-1">{t("card.confidence")}</span>
            <span className="mono tnum font-semibold text-foreground">{confidence}%</span>
          </div>
          <Progress value={confidence} className="h-1.5 bg-accent" aria-label={t("card.confidence")} />
        </div>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDraft(candidate.rule);
                setEditing(false);
              }}
            >
              {t("card.cancel")}
            </Button>
            <Button size="sm" onClick={save}>
              {t("card.save")}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Icon.Edit aria-hidden />
            {t("card.edit")}
          </Button>
        )}
      </div>
    </div>
  );
}
