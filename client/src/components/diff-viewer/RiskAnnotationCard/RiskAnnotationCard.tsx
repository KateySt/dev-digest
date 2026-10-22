/* RiskAnnotationCard — an Overview risk's explanation, shown inline on the
   diff line it was jumped from. Styled like a GitHub review comment
   (CommentCard's avatar+meta header, indented under the line) since that's
   conceptually what it is — an AI-authored comment that doesn't have a real
   GitHub thread behind it yet (posting these is a later feature; for now
   it's read-only, same as `unanchoredFindings` render before any review). */
"use client";

import { useTranslations } from "next-intl";
import type { RiskSeverity } from "@devdigest/shared";
import { Icon, type IconName } from "@/components/icon";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { COMMENT_BODY, COMMENT_CARD, COMMENT_HEAD, COMMENT_META, COMMENT_USER, RAIL } from "../constants";

const KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  reliability: "Activity",
  other: "AlertOctagon",
};

/** Badge tone per risk severity; labels live in `prReview.riskAnnotation.severity`. */
const SEVERITY_TONE: Record<RiskSeverity, "crit" | "warn" | "neutral"> = {
  high: "crit",
  medium: "warn",
  low: "neutral",
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
  const t = useTranslations("prReview.riskAnnotation");
  const KindIcon = Icon[KIND_ICON[kind] ?? "AlertOctagon"];
  return (
    <div className={RAIL}>
      <div className={COMMENT_CARD}>
        <div className={COMMENT_HEAD}>
          <UserAvatar name={t("author")} size={20} />
          <span className={COMMENT_USER}>{t("author")}</span>
          <Badge variant={SEVERITY_TONE[severity]}>
            <KindIcon aria-hidden />
            {t(`severity.${severity}`)}
          </Badge>
          <span className="flex-1" />
          <span className={COMMENT_META}>{t("source")}</span>
        </div>
        <div className={COMMENT_BODY}>
          <div className="mb-1 font-semibold text-foreground">{title}</div>
          {explanation}
        </div>
      </div>
    </div>
  );
}
