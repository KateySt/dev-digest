/* ReviewAllButton - SPEC-05 "Review all": a header action that, after a confirm
   dialog, starts a review on every needs_review PR in the repo. The label shows
   the count (C-AC-16); with nothing to review it is disabled and says why
   (C-AC-23). The target set is always the repo's whole needs_review set - the
   count comes from the unfiltered PR list, never from the status chip or search
   box (C-AC-24). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import type { PrMeta } from "@/lib/types";
import { ReviewAllDialog } from "./_components/ReviewAllDialog";

/** The count comes either from the paged list's server counts (`needsReviewCount`) or
 *  from a full PR list (`pulls`); undefined while loading. */
export function ReviewAllButton({
  repoId,
  needsReviewCount,
  pulls,
}: {
  repoId: string;
  needsReviewCount?: number;
  pulls?: PrMeta[];
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const count = needsReviewCount ?? (pulls ?? []).filter((p) => p.status === "needs_review").length;
  // Not loaded yet is not the same as "nothing needs review".
  const loaded = needsReviewCount !== undefined || pulls !== undefined;
  const empty = loaded && count === 0;

  return (
    <>
      <span className="inline-flex items-center gap-2">
        {empty && (
          <span id="review-all-reason" className="text-xs text-subtle-foreground">
            {t("list.reviewAll.unavailable")}
          </span>
        )}
        <Button
          variant="secondary"
          disabled={!loaded || empty}
          aria-describedby={empty ? "review-all-reason" : undefined}
          onClick={() => setOpen(true)}
        >
          <Icon.Zap aria-hidden />
          {t("list.reviewAll.button", { count })}
        </Button>
      </span>
      {open && <ReviewAllDialog repoId={repoId} pulls={pulls} onClose={() => setOpen(false)} />}
    </>
  );
}
