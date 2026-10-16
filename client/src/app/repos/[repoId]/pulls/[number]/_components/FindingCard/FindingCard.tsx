/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss/learn actions. Accept/dismiss reflect persisted
   timestamps; "Learned" links to the memory saved from this finding. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ConfidenceNum } from "@/components/confidence-num";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { MonoLink } from "@/components/mono-link";
import { CategoryTag, SeverityBadge, type Category, type Severity } from "@/components/severity";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_ACCENT, SEV_ACCENT_FALLBACK } from "./constants";
import { lineLabel, type LinkedSkill } from "./helpers";
import { githubBlobUrl } from "@/lib/utils";
import { EvalCaseAction } from "./EvalCaseAction";
import { ReplyAction } from "./ReplyAction";
import { LearnAction } from "./LearnAction";

const PROSE = "text-base leading-[1.6] text-muted-foreground";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  prId,
  agentId,
  linkedSkills,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** PR id — used to refresh the PR's reviews after eval-case / reply actions. */
  prId?: string | null;
  /** The review's agent; null/undefined disables "Turn into eval case". */
  agentId?: string | null;
  /** Skills linked to the agent (extra "Turn into eval case" targets); `null` while loading. */
  linkedSkills?: readonly LinkedSkill[] | null;
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const accent = SEV_ACCENT[f.severity] ?? SEV_ACCENT_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div
      data-finding-id={f.id}
      data-focused={focused ? "true" : undefined}
      className={cn(
        "overflow-hidden rounded-lg border border-l-3 bg-elevated transition-[opacity,border-color,box-shadow] duration-150",
        focused ? cn("ring-1", accent.focus) : "border-border",
        accent.edge,
        muted && "opacity-60",
      )}
    >
      <div onClick={() => setExpanded((e) => !e)} className="flex cursor-pointer items-start gap-3 px-4 py-3.5">
        <div className="pt-px">
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={cn(
                "text-base font-semibold",
                muted ? "text-subtle-foreground" : "text-foreground",
                dismissed && "line-through",
              )}
            >
              {f.title}
            </span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span className="text-xs font-semibold text-ok">{t("finding.accepted")}</span>}
            {dismissed && <span className="text-xs font-semibold text-subtle-foreground">{t("finding.dismissed")}</span>}
            {f.memory_id && (
              <Link
                href={`/memory?id=${f.memory_id}`}
                className="text-xs font-semibold text-primary no-underline"
                onClick={(e) => e.stopPropagation()}
              >
                {t("finding.learned")}
              </Link>
            )}
          </div>
          <div className="mt-1.25 flex items-center gap-3">
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown
          size={16}
          aria-hidden
          className={cn("mt-0.5 shrink-0 text-subtle-foreground transition-transform duration-150", expanded && "rotate-180")}
        />
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pt-3.5 pb-4">
          <div className={PROSE}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div className="mt-3.5">
              <div className="mb-2 text-xs font-bold tracking-[0.05em] text-subtle-foreground uppercase">
                {t("finding.suggestedFix")}
              </div>
              <div className={PROSE}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div className="mt-3.5 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              data-active={accepted}
              className="data-[active=true]:bg-accent"
              onClick={() => onAction?.("accept")}
            >
              <Icon.Check aria-hidden />
              {t("finding.accept")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              data-active={dismissed}
              className="data-[active=true]:bg-accent"
              onClick={() => onAction?.("dismiss")}
            >
              <Icon.X aria-hidden />
              {t("finding.dismiss")}
            </Button>
            <LearnAction f={f} />
            <EvalCaseAction f={f} agentId={agentId} linkedSkills={linkedSkills} />
            <ReplyAction f={f} prId={prId} />
          </div>
        </div>
      )}
    </div>
  );
}
