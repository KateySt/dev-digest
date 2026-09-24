/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and
   any anchored findings (colored severity bar + card, gated on showFindings). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { Severity } from "@/lib/types";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type DiffFindingApi } from "../findings";
import { type Line } from "../helpers";
import { SEVERITY_LABEL_KEYS } from "../constants";
import { s, lineRowFor, lineSignFor } from "../styles";
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
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
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
      style={highlight ? { ...cs.rowWrap, background: "var(--warn-bg)", outline: "2px solid var(--warn)", outlineOffset: -2 } : cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
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
          const color = SEV[severity].c;
          return (
            <div key={f.id} style={{ ...s.findingBlock, borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
              <span style={{ ...s.findingSeverityLabel, color }}>
                {t(`diffFindings.${SEVERITY_LABEL_KEYS[severity]}`)}
              </span>
              {findings.renderFinding(f)}
            </div>
          );
        })}
    </div>
  );
}
