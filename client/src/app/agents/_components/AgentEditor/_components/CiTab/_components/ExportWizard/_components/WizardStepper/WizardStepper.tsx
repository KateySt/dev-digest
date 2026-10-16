"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { STEP_KEYS } from "../../constants";

/** Numbered Target / Preview / Configure / Install indicator. The current step
 *  carries `aria-current="step"`; completed steps show a green check. */
export function WizardStepper({ step }: { step: number }) {
  const t = useTranslations("ci");
  return (
    <ol className="m-0 flex list-none items-center px-1.25" aria-label={t("exportWizard.stepsLabel")}>
      {STEP_KEYS.map((key, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <React.Fragment key={key}>
            <li className="flex items-center gap-2.5" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                  done && "bg-ok text-white",
                  current && "bg-primary text-primary-foreground",
                  !done && !current && "border border-border-strong bg-elevated text-subtle-foreground",
                )}
              >
                {done ? <Icon.Check size={13} aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm whitespace-nowrap",
                  current ? "font-semibold" : "font-medium",
                  done || current ? "text-foreground" : "text-subtle-foreground",
                )}
              >
                {t(`exportWizard.steps.${key}`)}
              </span>
            </li>
            {i < STEP_KEYS.length - 1 && (
              <li aria-hidden className={cn("mx-3.5 h-px min-w-6 flex-1", done ? "bg-ok" : "bg-border-strong")} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
