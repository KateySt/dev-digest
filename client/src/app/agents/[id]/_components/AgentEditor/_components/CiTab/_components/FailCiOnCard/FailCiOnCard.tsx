"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useInvalidateAgentCi } from "@/lib/hooks/ci";
import { SEGMENTS } from "./constants";
import { s } from "./styles";

/** "Fail CI on" policy card: Critical | Warning + | Never. A change is saved
 *  through the existing agent update hook and then refetches the CI data so the
 *  affected installations show "Out of date". While the save is in flight the
 *  new segment is shown optimistically; on failure the global error toast fires
 *  and the stored segment is shown again. */
export function FailCiOnCard({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const update = useUpdateAgent();
  const invalidateAgentCi = useInvalidateAgentCi();

  const pending = update.isPending ? update.variables?.patch.ci_fail_on : undefined;
  const shown: CiFailOn = pending ?? agent.ci_fail_on;
  // "any" is a valid stored value but not one of the three segments (client A3).
  const isCustom = !SEGMENTS.some((seg) => seg.value === shown);

  const choose = (value: CiFailOn) => {
    if (value === agent.ci_fail_on || update.isPending) return;
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: value } },
      { onSuccess: () => invalidateAgentCi(agent.id) },
    );
  };

  return (
    <div style={s.card}>
      <div style={s.text}>
        <div style={s.title}>{t("ciTab.failCiOn.title")}</div>
        <div style={s.helper}>{t("ciTab.failCiOn.helper")}</div>
        {isCustom && <div style={s.caption}>{t("ciTab.failCiOn.anyCaption")}</div>}
      </div>
      <div role="radiogroup" aria-label={t("ciTab.failCiOn.title")} style={s.segments}>
        {SEGMENTS.map((seg) => {
          const active = shown === seg.value;
          return (
            <button
              key={seg.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={update.isPending}
              onClick={() => choose(seg.value)}
              style={s.segment(active)}
            >
              {t(`ciTab.failCiOn.${seg.value}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
