"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { evalsHrefFor, type EvalTarget } from "../../helpers";
import { s } from "../../styles";

/** The target list behind "Turn into eval case" when the finding's agent has
 *  linked skills: the agent (default) first, then each skill. A target that
 *  already has a case shows "In eval set" with a link to its Evals tab; the
 *  others stay selectable. Plain buttons / links, so it is keyboard-operable. */
export function EvalTargetPicker({
  targets,
  caseIdFor,
  pendingKey,
  onPick,
}: {
  targets: readonly EvalTarget[];
  /** The finding's existing case id for a target, or null. */
  caseIdFor: (target: EvalTarget) => string | null;
  /** Key of the target whose case is being created right now. */
  pendingKey: string | null;
  onPick: (target: EvalTarget) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("finding.evalTargetsLabel")} style={s.picker}>
      {targets.map((target) => {
        const label = target.name ?? t("finding.evalTargetAgent");
        const inSet = caseIdFor(target) !== null;
        return (
          <div key={target.key} style={s.pickerRow}>
            {target.kind === "skill" ? <Icon.Sparkles size={13} /> : <Icon.Cpu size={13} />}
            {inSet ? (
              <>
                <span style={s.pickerName}>{label}</span>
                <Link
                  href={evalsHrefFor(target)}
                  style={s.evalSetLink}
                  aria-label={`${t("finding.inEvalSet")}: ${label}`}
                >
                  {t("finding.inEvalSet")}
                </Link>
              </>
            ) : (
              <button
                type="button"
                style={s.pickerBtn}
                disabled={pendingKey !== null}
                aria-label={t("finding.evalAddTo", { target: label })}
                onClick={() => onPick(target)}
              >
                <span style={s.pickerName}>{pendingKey === target.key ? t("finding.evalCreating") : label}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
