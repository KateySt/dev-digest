"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, PercentProgress, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { CONVENTION_CATEGORY_COLOR } from "../../constants";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  onAccept,
  onReject,
  onSaveRule,
  busy,
}: {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
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

  return (
    <Card style={s.card(candidate.status)}>
      <div style={s.header}>
        {editing ? (
          <Textarea value={draft} onChange={setDraft} rows={2} />
        ) : (
          <div style={s.title}>{candidate.rule}</div>
        )}
        {!editing && (
          <div style={s.actions}>
            <Button
              kind={isAccepted ? "primary" : "secondary"}
              size="sm"
              icon={isAccepted ? "Check" : undefined}
              onClick={onAccept}
              disabled={busy || isAccepted}
            >
              {isAccepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button kind="secondary" size="sm" onClick={onReject} disabled={busy || isRejected}>
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
