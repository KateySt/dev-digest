/* ReviewAllDialog - the confirm step of "Review all" (SPEC-05 C-AC-17..22, 26).
   Shows the server-computed counts + approximate cost; nothing starts until the
   user confirms, and the dialog is never pre-confirmed or remembered (a fresh
   estimate is fetched on every open). After confirming it lists per-PR outcomes
   - one PR failing to start never presents the whole batch as failed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { formatRunCost } from "@/components/run-cost-badge";
import { useBulkReview, useReviewEstimate } from "@/lib/hooks/reviews";
import type { PrMeta } from "@/lib/types";
import { BULK_REVIEW_MAX_PRS } from "../../constants";
import { estimateView } from "./helpers";
import { useDialogKeyboard } from "./useDialogKeyboard";
import { s } from "./styles";

export function ReviewAllDialog({
  repoId,
  pulls,
  onClose,
}: {
  repoId: string;
  pulls: PrMeta[];
  onClose: () => void;
}) {
  const t = useTranslations("prReview");
  const estimate = useReviewEstimate(repoId, true);
  const bulk = useBulkReview(repoId);

  const bodyRef = useDialogKeyboard(onClose);

  const result = bulk.data?.results;
  const view = estimate.data ? estimateView(estimate.data) : null;
  const canConfirm = view === "ready" && !bulk.isPending && !result;

  const serverRefusal =
    bulk.error instanceof ApiError
      ? bulk.error.code === "bulk_review_too_large"
        ? t("list.reviewAll.serverTooLarge", { max: BULK_REVIEW_MAX_PRS })
        : bulk.error.code === "nothing_to_review"
          ? t("list.reviewAll.serverNothing")
          : bulk.error.code === "no_enabled_agents"
            ? t("list.reviewAll.serverNoAgents")
            : null
      : null;

  const pullById = new Map(pulls.map((p) => [p.id, p]));

  return (
    <Modal width={520} onClose={onClose}>
      <Modal.Header title={t("list.reviewAll.dialogTitle")} onClose={onClose} />
      <div ref={bodyRef} style={s.body} aria-live="polite">
        {result ? (
          <>
            <p style={s.text}>
              {t("list.reviewAll.resultSummary", {
                started: result.filter((r) => r.outcome === "started").length,
                skipped: result.filter((r) => r.outcome === "skipped").length,
                failed: result.filter((r) => r.outcome === "failed").length,
              })}
            </p>
            {result.some((r) => r.outcome === "failed") && (
              <div>
                <p style={s.muted}>{t("list.reviewAll.failedHeading")}</p>
                <ul style={s.failedList}>
                  {result
                    .filter((r) => r.outcome === "failed")
                    .map((r) => (
                      <li key={r.pr_id} style={s.failedItem}>
                        {t("list.reviewAll.failedItem", {
                          number: pullById.get(r.pr_id)?.number ?? "?",
                          title: pullById.get(r.pr_id)?.title ?? r.pr_id,
                          reason: r.reason ?? "",
                        })}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </>
        ) : estimate.isLoading ? (
          <p style={s.muted}>{t("list.reviewAll.loading")}</p>
        ) : estimate.isError ? (
          <p style={s.refusal}>{t("list.reviewAll.estimateError")}</p>
        ) : estimate.data ? (
          <>
            {view === "noPrs" && <p style={s.text}>{t("list.reviewAll.noPrs")}</p>}
            {view === "noAgents" && <p style={s.refusal}>{t("list.reviewAll.noAgents")}</p>}
            {view === "tooMany" && (
              <p style={s.refusal}>
                {t("list.reviewAll.tooMany", { count: estimate.data.pr_count, max: BULK_REVIEW_MAX_PRS })}
              </p>
            )}
            {view === "allInFlight" && <p style={s.text}>{t("list.reviewAll.allInFlight")}</p>}
            {view === "ready" && (
              <>
                <p style={s.text}>
                  {t("list.reviewAll.counts", {
                    prs: estimate.data.pr_count,
                    agents: estimate.data.agent_count,
                    runs: estimate.data.run_count,
                  })}
                </p>
                <p style={s.muted}>
                  {estimate.data.approx_cost_usd == null
                    ? t("list.reviewAll.noCostHistory")
                    : t("list.reviewAll.approxCost", { cost: formatRunCost(estimate.data.approx_cost_usd) })}
                </p>
                {estimate.data.skip_count > 0 && (
                  <p style={s.muted}>{t("list.reviewAll.skipped", { count: estimate.data.skip_count })}</p>
                )}
              </>
            )}
            {serverRefusal && <p style={s.refusal}>{serverRefusal}</p>}
          </>
        ) : null}
      </div>
      <Modal.Footer>
        <div style={s.footer}>
          <div style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {result ? t("list.reviewAll.close") : t("list.reviewAll.cancel")}
          </Button>
          {!result && (
            <Button kind="primary" icon="Zap" disabled={!canConfirm} onClick={() => bulk.mutate()}>
              {bulk.isPending ? t("list.reviewAll.starting") : t("list.reviewAll.confirm")}
            </Button>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}
