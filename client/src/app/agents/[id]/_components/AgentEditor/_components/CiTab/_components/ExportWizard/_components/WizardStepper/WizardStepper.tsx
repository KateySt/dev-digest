"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { STEP_KEYS } from "../../constants";
import { s } from "./styles";

/** Numbered Target / Preview / Configure / Install indicator. The current step
 *  carries `aria-current="step"`; completed steps show a green check. */
export function WizardStepper({ step }: { step: number }) {
  const t = useTranslations("ci");
  return (
    <ol style={s.list} aria-label={t("exportWizard.stepsLabel")}>
      {STEP_KEYS.map((key, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <React.Fragment key={key}>
            <li style={s.item} aria-current={current ? "step" : undefined}>
              <span style={s.dot(done, current)}>{done ? <Icon.Check size={13} /> : i + 1}</span>
              <span style={s.label(done, current)}>{t(`exportWizard.steps.${key}`)}</span>
            </li>
            {i < STEP_KEYS.length - 1 && <li aria-hidden style={s.line(done)} />}
          </React.Fragment>
        );
      })}
    </ol>
  );
}
