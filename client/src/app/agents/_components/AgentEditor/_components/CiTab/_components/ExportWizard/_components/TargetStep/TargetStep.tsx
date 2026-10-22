"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TARGETS, type ExportTarget } from "../../constants";

const ERROR = "text-sm text-crit wrap-anywhere";

/** Step 1 — pick the CI target (GitHub Actions or Jenkins; the rest are stubs).
 *  The repo is the one open in the sidebar, so there is nothing to type here. */
export function TargetStep({
  target,
  onTarget,
  hasRepo,
  error,
  conflict,
}: {
  target: ExportTarget;
  onTarget: (target: ExportTarget) => void;
  hasRepo: boolean;
  error: string | null;
  /** C-AC-36: the repo already uses another target. */
  conflict: { repo: string; target: string } | null;
}) {
  const t = useTranslations("ci");
  const pick = (id: string) => {
    if (id === "gha" || id === "jenkins") onTarget(id);
  };
  const onKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(id);
    }
  };
  const conflictTarget =
    conflict && (conflict.target === "gha" || conflict.target === "jenkins")
      ? t(`exportWizard.targets.${conflict.target}`)
      : conflict?.target;

  return (
    <>
      <div role="radiogroup" aria-label={t("exportWizard.steps.target")} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TARGETS.map((option) => {
          const I = Icon[option.icon];
          const selected = option.id === target;
          return (
            // Disabled cards have no handlers, so neither a click nor the keyboard can select them (C-AC-11).
            <div
              key={option.id}
              role="radio"
              aria-checked={selected}
              aria-disabled={option.disabled ? "true" : undefined}
              tabIndex={option.disabled ? -1 : 0}
              onClick={option.disabled ? undefined : () => pick(option.id)}
              onKeyDown={option.disabled ? undefined : (e) => onKey(e, option.id)}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected ? "border-primary bg-brand-bg" : "border-border bg-surface",
                option.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-accent",
              )}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
                  <I size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-base font-semibold">{t(`exportWizard.targets.${option.id}`)}</span>
                {option.id === "gha" && <Badge variant="brand">{t("exportWizard.recommended")}</Badge>}
                {option.disabled && <Badge variant="neutral">{t("exportWizard.comingSoon")}</Badge>}
              </div>
              <div className="text-ui text-muted-foreground wrap-anywhere">{t(`exportWizard.targets.${option.id}Desc`)}</div>
            </div>
          );
        })}
      </div>

      {!hasRepo && <div className={ERROR}>{t("exportWizard.noRepo")}</div>}
      {conflict ? (
        <div role="alert" className={ERROR}>
          {t("exportWizard.targetConflict", { repo: conflict.repo, target: conflictTarget ?? "" })}
        </div>
      ) : (
        error && <div className={ERROR}>{t("exportWizard.previewError", { message: error })}</div>
      )}
    </>
  );
}
