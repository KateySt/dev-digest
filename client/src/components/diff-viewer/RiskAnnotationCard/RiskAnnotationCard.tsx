/* RiskAnnotationCard — an Overview risk's explanation, shown inline on the
   diff line it was jumped from. Styled like a GitHub review comment
   (CommentCard's avatar+meta header, indented under the line) since that's
   conceptually what it is — an AI-authored comment that doesn't have a real
   GitHub thread behind it yet (posting these is a later feature; for now
   it's read-only, same as `unanchoredFindings` render before any review). */
"use client";

import React from "react";
import { Avatar, Badge, Card, type IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";
import { cs } from "../comments";

const KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  reliability: "Activity",
  other: "AlertOctagon",
};

const SEVERITY_META: Record<RiskSeverity, { c: string; bg: string; label: string }> = {
  high: { c: "var(--crit)", bg: "var(--crit-bg)", label: "High risk" },
  medium: { c: "var(--warn)", bg: "var(--warn-bg)", label: "Medium risk" },
  low: { c: "var(--text-muted)", bg: "var(--bg-hover)", label: "Low risk" },
};

/** Shape threaded from an Overview risk's file ref, through the tab-jump
 *  query state, down to the target line — one type instead of five inline
 *  duplicates across FileCard/FileGroup/DiffViewer/DiffTab/CodeLine. */
export interface RiskAnnotation {
  kind: string;
  title: string;
  explanation: string;
  severity: RiskSeverity;
}

export function RiskAnnotationCard({ kind, title, explanation, severity }: RiskAnnotation) {
  const meta = SEVERITY_META[severity];
  const kindIcon: IconName = KIND_ICON[kind] ?? "AlertOctagon";
  return (
    <div style={cs.thread}>
      <Card>
        <div style={cs.headRow}>
          <Avatar name="DevDigest AI" size={20} />
          <span style={cs.user}>DevDigest AI</span>
          <Badge color={meta.c} bg={meta.bg} icon={kindIcon}>
            {meta.label}
          </Badge>
          <span style={{ flex: 1 }} />
          <span style={cs.time}>PR risk analysis</span>
        </div>
        <div style={cs.mdBody}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{title}</div>
          {explanation}
        </div>
      </Card>
    </div>
  );
}
