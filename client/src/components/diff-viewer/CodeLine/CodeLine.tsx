/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and
   any anchored findings (colored severity bar + card, gated on showFindings). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEVERITY_STYLE } from "@/components/severity";
import { cn } from "@/lib/utils";
import type { FindingRecord } from "@devdigest/shared";
import type { Severity } from "@/lib/types";
import { commentTargetFor, type CommentThread, type DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import type { Line } from "../helpers";
import { FINDING_BLOCK, SEVERITY_LABEL, SEVERITY_LABEL_KEYS } from "../constants";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { RiskAnnotationCard, type RiskAnnotation } from "../RiskAnnotationCard";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  findingsForLine,
  highlight,
  anchorRef,
  riskAnnotation,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Inline-findings API (render-prop + action callback) — optional, only
   *  present when the Files-changed tab has smart-diff findings to show. */
  findings?: DiffFindingApi;
  /** Findings anchored to THIS line (already resolved by FileCard). */
  findingsForLine?: FindingRecord[];
  /** This is the deep-link target line (e.g. from an Overview risk's file
   *  ref) — flashes a highlight so it's findable at a glance after the jump. */
  highlight?: boolean;
  /** Attached by FileCard to the target line so it can scrollIntoView once. */
  anchorRef?: React.Ref<HTMLDivElement>;
  /** The risk that was clicked to jump here — a Risk isn't a Finding (no
   *  review may have even run yet), so it can't ride the findings pipeline;
   *  render its own explanation inline instead, same as a finding would. */
  riskAnnotation?: RiskAnnotation | null;
}) {
  const t = useTranslations("prReview");
  const tShell = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono bg-brand-bg px-3.5 text-xs leading-5 text-brand-text">
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      ref={anchorRef}
      className={cn("relative", highlight && "bg-warn-bg outline-2 -outline-offset-2 outline-warn")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={cn(
          "flex items-stretch text-sm leading-5",
          ln.kind === "add" && "bg-code-add",
          ln.kind === "del" && "bg-code-del",
        )}
      >
        <span className="mono tnum relative w-11 shrink-0 pr-2.5 text-right text-subtle-foreground select-none">
          {showAdd && target && (
            <button
              type="button"
              title={tShell("diffViewer.addComment")}
              aria-label={tShell("diffViewer.addComment")}
              onClick={() => setComposing(true)}
              className="absolute top-1/2 left-0.5 z-1 flex size-4.5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[5px] border-none bg-primary p-0 text-base leading-4.5 text-primary-foreground shadow-[0_1px_3px_rgba(0,0,0,.35)]"
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span
          className={cn(
            "mono w-3.5 shrink-0 text-center",
            ln.kind === "add" ? "text-code-add-text" : ln.kind === "del" ? "text-code-del-text" : "text-subtle-foreground",
          )}
        >
          {sign}
        </span>
        <span className="mono flex-1 pr-3 break-words whitespace-pre-wrap text-foreground">
          {ln.text || " "}
        </span>
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}

      {riskAnnotation && (
        <RiskAnnotationCard
          kind={riskAnnotation.kind}
          title={riskAnnotation.title}
          explanation={riskAnnotation.explanation}
          severity={riskAnnotation.severity}
        />
      )}

      {findings &&
        findings.showFindings &&
        (findingsForLine ?? []).map((f) => {
          const severity = f.severity as Severity;
          const sev = SEVERITY_STYLE[severity];
          return (
            <div key={f.id} className={cn(FINDING_BLOCK, "border-l-3 pl-2.5", sev.border)}>
              <span className={cn(SEVERITY_LABEL, sev.text)}>
                {t(`diffFindings.${SEVERITY_LABEL_KEYS[severity]}`)}
              </span>
              {findings.renderFinding(f)}
            </div>
          );
        })}
    </div>
  );
}
