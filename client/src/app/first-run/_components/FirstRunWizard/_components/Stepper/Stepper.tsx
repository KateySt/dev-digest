/* Stepper — the wizard's numbered progress row: done ✓ / active / pending. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { SETUP_STEPS, type SetupStep } from "@/lib/hooks";

export function Stepper({ current }: { current: SetupStep }) {
  const t = useTranslations("firstRun");
  const currentIdx = SETUP_STEPS.indexOf(current);
  return (
    <ol className="m-0 mb-7 flex list-none items-center gap-3 p-0" aria-label={t("stepsLabel")}>
      {SETUP_STEPS.map((step, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
        return (
          <React.Fragment key={step}>
            {i > 0 && <li aria-hidden className="h-px flex-1 bg-border-strong" />}
            <li className="flex shrink-0 items-center gap-2.5" aria-current={state === "active" ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-6.5 place-items-center rounded-full text-sm font-semibold",
                  state === "active" && "bg-primary text-primary-foreground",
                  state === "done" && "bg-ok text-white",
                  state === "pending" && "border border-border-strong bg-transparent text-subtle-foreground",
                )}
              >
                {state === "done" ? <Icon.Check size={13} aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  state === "active" ? "font-semibold text-foreground" : "font-medium text-subtle-foreground",
                )}
              >
                {t(`steps.${step}`)}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}
