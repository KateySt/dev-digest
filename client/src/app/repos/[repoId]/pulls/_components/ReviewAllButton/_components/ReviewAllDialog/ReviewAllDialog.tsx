/* ReviewAllDialog - the confirm step of "Review all" (SPEC-05 C-AC-17..22, 26).
   Shows the server-computed counts + approximate cost; nothing starts until the
   user confirms, and the dialog is never pre-confirmed or remembered (a fresh
   estimate is fetched on every open). After confirming it lists per-PR outcomes
   - one PR failing to start never presents the whole batch as failed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { formatRunCost } from "@/components/run-cost-badge";
import { useBulkReview, useReviewEstimate } from "@/lib/hooks/reviews";
import type { PrMeta } from "@/lib/types";
import { BULK_REVIEW_MAX_PRS } from "../../constants";
import { estimateView } from "./helpers";

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
    // Radix Dialog traps focus, closes on Escape and returns focus to the opener.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("list.reviewAll.dialogTitle")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 p-6" aria-live="polite">
        {result ? (
          <>
            <p className="text-[13.5px] leading-normal text-foreground">
              {t("list.reviewAll.resultSummary", {
                started: result.filter((r) => r.outcome === "started").length,
                skipped: result.filter((r) => r.outcome === "skipped").length,
                failed: result.filter((r) => r.outcome === "failed").length,
              })}
            </p>
            {result.some((r) => r.outcome === "failed") && (
              <div>
                <p className="text-sm leading-normal text-muted-foreground">{t("list.reviewAll.failedHeading")}</p>
                <ul className="m-0 list-disc pl-4.5 text-sm text-muted-foreground">
                  {result
                    .filter((r) => r.outcome === "failed")
                    .map((r) => (
                      // Untrusted PR titles / server error text: allow long unbroken strings to wrap.
                      <li key={r.pr_id} className="min-w-0 wrap-anywhere break-words">
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
          <p className="text-sm leading-normal text-muted-foreground">{t("list.reviewAll.loading")}</p>
        ) : estimate.isError ? (
          <p className="text-[13.5px] leading-normal text-crit">{t("list.reviewAll.estimateError")}</p>
        ) : estimate.data ? (
          <>
            {view === "noPrs" && <p className="text-[13.5px] leading-normal text-foreground">{t("list.reviewAll.noPrs")}</p>}
            {view === "noAgents" && <p className="text-[13.5px] leading-normal text-crit">{t("list.reviewAll.noAgents")}</p>}
            {view === "tooMany" && (
              <p className="text-[13.5px] leading-normal text-crit">
                {t("list.reviewAll.tooMany", { count: estimate.data.pr_count, max: BULK_REVIEW_MAX_PRS })}
              </p>
            )}
            {view === "allInFlight" && <p className="text-[13.5px] leading-normal text-foreground">{t("list.reviewAll.allInFlight")}</p>}
            {view === "ready" && (
              <>
                <p className="text-[13.5px] leading-normal text-foreground">
                  {t("list.reviewAll.counts", {
                    prs: estimate.data.pr_count,
                    agents: estimate.data.agent_count,
                    runs: estimate.data.run_count,
                  })}
                </p>
                <p className="text-sm leading-normal text-muted-foreground">
                  {estimate.data.approx_cost_usd == null
                    ? t("list.reviewAll.noCostHistory")
                    : t("list.reviewAll.approxCost", { cost: formatRunCost(estimate.data.approx_cost_usd) })}
                </p>
                {estimate.data.skip_count > 0 && (
                  <p className="text-sm leading-normal text-muted-foreground">{t("list.reviewAll.skipped", { count: estimate.data.skip_count })}</p>
                )}
              </>
            )}
            {serverRefusal && <p className="text-[13.5px] leading-normal text-crit">{serverRefusal}</p>}
          </>
        ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {result ? t("list.reviewAll.close") : t("list.reviewAll.cancel")}
          </Button>
          {!result && (
            <Button disabled={!canConfirm} onClick={() => bulk.mutate()}>
              <Icon.Zap aria-hidden />
              {bulk.isPending ? t("list.reviewAll.starting") : t("list.reviewAll.confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
