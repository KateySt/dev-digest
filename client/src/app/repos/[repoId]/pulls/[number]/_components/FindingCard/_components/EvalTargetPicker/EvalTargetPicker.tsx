"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { evalsHrefFor, type EvalTarget } from "../../helpers";
import { EVAL_SET_LINK } from "../../constants";

const NAME = "min-w-0 flex-1 text-sm text-foreground wrap-anywhere break-words";

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
    <div
      role="group"
      aria-label={t("finding.evalTargetsLabel")}
      className="flex max-w-[360px] min-w-60 flex-col gap-1 rounded-lg border border-border-strong bg-elevated p-1.5"
    >
      {targets.map((target) => {
        const label = target.name ?? t("finding.evalTargetAgent");
        const inSet = caseIdFor(target) !== null;
        return (
          <div key={target.key} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
            {target.kind === "skill" ? <Icon.Sparkles size={13} aria-hidden /> : <Icon.Cpu size={13} aria-hidden />}
            {inSet ? (
              <>
                <span className={NAME}>{label}</span>
                <Link
                  href={evalsHrefFor(target)}
                  className={EVAL_SET_LINK}
                  aria-label={`${t("finding.inEvalSet")}: ${label}`}
                >
                  {t("finding.inEvalSet")}
                </Link>
              </>
            ) : (
              <button
                type="button"
                className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border-none bg-transparent px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent disabled:cursor-default"
                disabled={pendingKey !== null}
                aria-label={t("finding.evalAddTo", { target: label })}
                onClick={() => onPick(target)}
              >
                <span className={NAME}>{pendingKey === target.key ? t("finding.evalCreating") : label}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
