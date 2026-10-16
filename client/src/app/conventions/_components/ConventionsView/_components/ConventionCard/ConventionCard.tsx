"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Checkbox, PercentProgress, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { CONVENTION_CATEGORY_COLOR } from "../../constants";
import { s } from "./styles";

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

  return (
    <Card style={s.card(candidate.status)}>
      <div style={s.header}>
        {onToggleSelected && (
          <Checkbox
            checked={!!selected}
            onChange={onToggleSelected}
            label={<span style={s.srOnly}>{t("selection.select", { rule: candidate.rule })}</span>}
          />
        )}
        {editing ? (
          <Textarea value={draft} onChange={setDraft} rows={2} />
        ) : (
          <div style={s.title}>{candidate.rule}</div>
        )}
        {!editing && isUsed && onUnlink && (
          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="X"
              onClick={onUnlink}
              disabled={busy}
              title={t("card.unlinkHint")}
              aria-label={`${t("card.unlink")}: ${candidate.rule}`}
            >
              {t("card.unlink")}
            </Button>
          </div>
        )}
        {!editing && !isUsed && (
          <div style={s.actions}>
            <Button
              kind={isAccepted ? "primary" : "secondary"}
              size="sm"
              icon={isAccepted ? "Check" : undefined}
              onClick={onAccept}
              disabled={busy || isAccepted}
              aria-label={`${isAccepted ? t("card.accepted") : t("card.accept")}: ${candidate.rule}`}
            >
              {isAccepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button
              kind="secondary"
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

      <div style={s.metaRow}>
        <Badge color={CONVENTION_CATEGORY_COLOR[candidate.category]}>
          {t(`card.category.${candidate.category}`)}
        </Badge>
        <span style={s.evidencePath}>
          {candidate.evidence_path}
          {candidate.evidence_line != null ? `:${candidate.evidence_line}` : ""}
        </span>
      </div>

      {candidate.rationale && <div style={s.rationale}>{candidate.rationale}</div>}

      <pre style={s.snippet}>{candidate.evidence_snippet}</pre>

      <div style={s.footer}>
        <div style={s.confidenceWrap}>
          <PercentProgress value={Math.round(candidate.confidence * 100)} label={t("card.confidence")} />
        </div>
        {editing ? (
          <div style={s.editActions}>
            <Button
              kind="ghost"
              size="sm"
              onClick={() => {
                setDraft(candidate.rule);
                setEditing(false);
              }}
            >
              {t("card.cancel")}
            </Button>
            <Button kind="primary" size="sm" onClick={save}>
              {t("card.save")}
            </Button>
          </div>
        ) : (
          <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)}>
            {t("card.edit")}
          </Button>
        )}
      </div>
    </Card>
  );
}
