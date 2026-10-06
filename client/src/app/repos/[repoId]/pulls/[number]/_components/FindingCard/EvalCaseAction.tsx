/* "Turn into eval case" action + its confirmation. Disabled reasons are
   exposed via title + aria-describedby; a 409 (case already exists) resolves
   like a success and flips the button to "In eval set". State is local (the
   card stays free of React Query context). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { createEvalCaseFromFinding, type EvalCaseFromFinding } from "@/lib/hooks/eval-cases";
import { notify } from "@/lib/toast";
import { evalKindFor } from "./helpers";
import { s } from "./styles";

export function EvalCaseAction({
  f,
  agentId,
}: {
  f: FindingRecord;
  /** The review's agent; null/undefined = agentless review. */
  agentId?: string | null;
}) {
  const t = useTranslations("prReview");
  const hintId = React.useId();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<EvalCaseFromFinding | null>(null);

  const kind = result?.created?.kind ?? evalKindFor(f);
  const caseId = f.eval_case_id ?? result?.case_id ?? null;
  const evalsHref = agentId ? `/agents/${agentId}?tab=evals` : undefined;
  const disabledReason = !agentId ? t("finding.evalAgentOnly") : !kind ? t("finding.evalDecideFirst") : null;

  const handleClick = async () => {
    setPending(true);
    try {
      setResult(await createEvalCaseFromFinding(f.id));
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  if (caseId) {
    const created = result && !result.already_existed;
    return (
      <>
        {evalsHref ? (
          <Link href={evalsHref} style={s.evalSetLink}>
            {t("finding.inEvalSet")}
          </Link>
        ) : (
          <span style={s.evalSetLink}>{t("finding.inEvalSet")}</span>
        )}
        {created && kind && (
          <span role="status" style={s.confirmation}>
            {t("finding.evalCreated", {
              kind: t(kind === "must_find" ? "finding.evalKindMustFind" : "finding.evalKindMustNotFlag"),
            })}{" "}
            {evalsHref && (
              <Link href={evalsHref} style={s.inlineLink}>
                {t("finding.viewEvalCase")}
              </Link>
            )}
          </span>
        )}
      </>
    );
  }

  return (
    <span title={disabledReason ?? undefined} style={s.hintWrap}>
      <Button
        kind="secondary"
        size="sm"
        icon="FlaskConical"
        disabled={!!disabledReason || pending}
        aria-describedby={disabledReason ? hintId : undefined}
        onClick={handleClick}
      >
        {pending ? t("finding.evalCreating") : t("finding.turnIntoEval")}
      </Button>
      {disabledReason && (
        <span id={hintId} style={s.srOnly}>
          {disabledReason}
        </span>
      )}
    </span>
  );
}
