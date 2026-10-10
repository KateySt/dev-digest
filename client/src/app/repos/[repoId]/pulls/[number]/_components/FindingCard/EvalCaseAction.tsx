/* "Turn into eval case" action + its confirmation. Disabled reasons are
   exposed via title + aria-describedby; a 409 (case already exists for that
   target) resolves like a success and marks the target "In eval set". State is
   local (the card stays free of React Query context).

   Targets: the finding's agent (default) and, when that agent has linked
   skills, each skill. With no linked skills it stays today's single click; with
   some, the button opens a target picker. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { createEvalCaseFromFinding, type EvalCaseFromFinding } from "@/lib/hooks/eval-cases";
import { notify } from "@/lib/contexts";
import {
  buildEvalTargets,
  evalKindFor,
  evalsHrefFor,
  existingCaseId,
  type EvalTarget,
  type LinkedSkill,
} from "./helpers";
import { EvalTargetPicker } from "./_components/EvalTargetPicker";
import { s } from "./styles";

export function EvalCaseAction({
  f,
  agentId,
  linkedSkills,
}: {
  f: FindingRecord;
  /** The review's agent; null/undefined = agentless review. */
  agentId?: string | null;
  /** Skills linked to the agent: a list (possibly empty), `null` while it is
   *  still loading (NOT the same as "none" — the picker must not be skipped
   *  just because the links haven't arrived), `undefined` when not provided. */
  linkedSkills?: readonly LinkedSkill[] | null;
}) {
  const t = useTranslations("prReview");
  const hintId = React.useId();
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, EvalCaseFromFinding>>({});

  const skillsLoading = linkedSkills === null;
  const targets = agentId ? buildEvalTargets(agentId, linkedSkills ?? []) : [];
  const agentTarget = targets[0];
  const menu = (linkedSkills?.length ?? 0) > 0;

  const kind = evalKindFor(f) ?? Object.values(results).find((r) => r.created)?.created?.kind ?? null;
  const caseIdFor = (target: EvalTarget) => existingCaseId(f, target) ?? results[target.key]?.case_id ?? null;
  const decideReason = !agentId ? t("finding.evalAgentOnly") : !kind ? t("finding.evalDecideFirst") : null;
  const disabledReason = decideReason ?? (skillsLoading ? t("finding.evalLoadingSkills") : null);

  const create = async (target: EvalTarget) => {
    setPendingKey(target.key);
    try {
      const result = await createEvalCaseFromFinding(f.id, menu ? { kind: target.kind, id: target.id } : undefined);
      setResults((cur) => ({ ...cur, [target.key]: result }));
      setOpen(false);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingKey(null);
    }
  };

  const confirmations = targets.flatMap((target) => {
    const r = results[target.key];
    if (!r || r.already_existed) return [];
    const caseKind = r.created?.kind ?? kind;
    if (!caseKind) return [];
    const kindLabel = t(caseKind === "must_find" ? "finding.evalKindMustFind" : "finding.evalKindMustNotFlag");
    return [{ target, kindLabel }];
  });

  const confirmationNodes = confirmations.map(({ target, kindLabel }) => (
    <span key={target.key} role="status" style={s.confirmation}>
      {menu
        ? t("finding.evalCreatedFor", { target: target.name ?? t("finding.evalTargetAgentName"), kind: kindLabel })
        : t("finding.evalCreated", { kind: kindLabel })}{" "}
      <Link href={evalsHrefFor(target)} style={s.inlineLink}>
        {target.kind === "skill" ? t("finding.viewSkillEvalCase") : t("finding.viewEvalCase")}
      </Link>
    </span>
  ));

  // Single-target mode: today's behaviour — the button flips to "In eval set".
  if (!menu && agentTarget && caseIdFor(agentTarget)) {
    return (
      <>
        <Link href={evalsHrefFor(agentTarget)} style={s.evalSetLink}>
          {t("finding.inEvalSet")}
        </Link>
        {confirmationNodes}
      </>
    );
  }

  return (
    <>
      <span style={menu ? s.pickerWrap : s.hintWrap}>
        <span title={disabledReason ?? undefined} style={s.hintWrap}>
          <Button
            kind="secondary"
            size="sm"
            icon="FlaskConical"
            iconRight={menu ? "ChevronDown" : undefined}
            disabled={!!disabledReason || pendingKey !== null}
            aria-describedby={disabledReason ? hintId : undefined}
            aria-expanded={menu ? open : undefined}
            aria-haspopup={menu ? "true" : undefined}
            onClick={() => (menu ? setOpen((v) => !v) : agentTarget && create(agentTarget))}
          >
            {pendingKey !== null && !menu ? t("finding.evalCreating") : t("finding.turnIntoEval")}
          </Button>
          {disabledReason && (
            <span id={hintId} style={s.srOnly}>
              {disabledReason}
            </span>
          )}
        </span>
        {menu && open && !disabledReason && (
          <EvalTargetPicker targets={targets} caseIdFor={caseIdFor} pendingKey={pendingKey} onPick={create} />
        )}
      </span>
      {confirmationNodes}
    </>
  );
}
