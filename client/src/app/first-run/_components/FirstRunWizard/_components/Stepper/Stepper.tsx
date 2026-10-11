/* Stepper — the wizard's numbered progress row: done ✓ / active / pending. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { SETUP_STEPS, type SetupStep } from "@/lib/hooks";
import { s } from "./styles";

export function Stepper({ current }: { current: SetupStep }) {
  const t = useTranslations("firstRun");
  const currentIdx = SETUP_STEPS.indexOf(current);
  return (
    <ol style={s.row} aria-label="Setup progress">
      {SETUP_STEPS.map((step, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "active" : "pending";
        return (
          <React.Fragment key={step}>
            {i > 0 && <li aria-hidden style={s.line} />}
            <li style={s.item} aria-current={state === "active" ? "step" : undefined}>
              <span style={s.dot(state)}>{state === "done" ? <Icon.Check size={13} /> : i + 1}</span>
              <span style={s.label(state)}>{t(`steps.${step}`)}</span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}
