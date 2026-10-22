"use client";

import { useTranslations } from "next-intl";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useInvalidateAgentCi } from "@/lib/hooks/ci";
import { cn } from "@/lib/utils";
import { SEGMENTS } from "./constants";

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
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold">{t("ciTab.failCiOn.title")}</div>
        <div className="mt-1 text-ui leading-[1.45] text-muted-foreground">{t("ciTab.failCiOn.helper")}</div>
        {isCustom && <div className="mt-1.5 text-xs text-subtle-foreground">{t("ciTab.failCiOn.anyCaption")}</div>}
      </div>
      <div
        role="radiogroup"
        aria-label={t("ciTab.failCiOn.title")}
        className="inline-flex shrink-0 rounded-lg border border-border-strong bg-elevated p-0.75"
      >
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
              className={cn(
                "cursor-pointer rounded-md border-none px-3.5 py-1.5 text-sm disabled:cursor-default",
                active ? "bg-accent font-semibold text-foreground" : "bg-transparent font-medium text-subtle-foreground",
              )}
            >
              {t(`ciTab.failCiOn.${seg.value}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
