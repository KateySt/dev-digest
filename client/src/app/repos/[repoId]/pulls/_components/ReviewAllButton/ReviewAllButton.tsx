/* ReviewAllButton - SPEC-05 "Review all": a header action that, after a confirm
   dialog, starts a review on every needs_review PR in the repo. The label shows
   the count (C-AC-16); with nothing to review it is disabled and says why
   (C-AC-23). The target set is always the repo's whole needs_review set - the
   count comes from the unfiltered PR list, never from the status chip or search
   box (C-AC-24). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { ReviewAllDialog } from "./_components/ReviewAllDialog";
import { s } from "./styles";

export function ReviewAllButton({ repoId, pulls }: { repoId: string; pulls: PrMeta[] | undefined }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  const count = (pulls ?? []).filter((p) => p.status === "needs_review").length;
  // Not loaded yet is not the same as "nothing needs review".
  const loaded = pulls !== undefined;
  const empty = loaded && count === 0;

  return (
    <>
      <span style={s.wrap}>
        {empty && (
          <span id="review-all-reason" style={s.reason}>
            {t("list.reviewAll.unavailable")}
          </span>
        )}
        <Button
          kind="secondary"
          icon="Zap"
          disabled={!loaded || empty}
          aria-describedby={empty ? "review-all-reason" : undefined}
          onClick={() => setOpen(true)}
        >
          {t("list.reviewAll.button", { count })}
        </Button>
      </span>
      {open && <ReviewAllDialog repoId={repoId} pulls={pulls ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}
