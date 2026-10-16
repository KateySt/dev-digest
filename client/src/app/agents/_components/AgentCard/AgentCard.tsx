/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Agent, AgentPerfRow } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { modelChipClass, perfLine } from "./helpers";

export function AgentCard({
  ag,
  active,
  skillCount,
  perf,
  onClick,
  onToggle,
  onDeleted,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  perf?: AgentPerfRow;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const stats = perf ? perfLine(perf, t) : null;
  return (
    <div
      onClick={onClick}
      className={cn(
        "mb-2.5 cursor-pointer rounded-lg border p-3.5",
        active ? "border-border-strong bg-accent" : "border-border bg-elevated",
        !ag.enabled && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="grid size-6.5 shrink-0 place-items-center rounded-[7px] bg-brand-bg text-primary">
          <Icon.Cpu size={15} aria-hidden />
        </div>
        <span className="flex-1 truncate text-base font-semibold">{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Switch checked={ag.enabled} onCheckedChange={onToggle} size="sm" />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm(t("card.deleteConfirm", { name: ag.name }))) return;
            onDeleted?.();
            del.mutate(ag.id);
          }}
          disabled={del.isPending}
          title={t("card.deleteLabel")}
          aria-label={t("card.deleteLabel")}
          className="inline-flex cursor-pointer border-none bg-transparent p-1 text-subtle-foreground hover:text-crit disabled:cursor-not-allowed"
        >
          <Icon.Trash size={14} className={del.isPending ? "animate-dd-spin" : undefined} aria-hidden />
        </button>
      </div>
      <div className="my-2 truncate text-sm leading-[1.4] text-subtle-foreground">
        {ag.description || t("card.noDescription")}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("mono rounded-sm px-2 py-px text-xs font-semibold", modelChipClass(ag.model))}>{ag.model}</span>
        {skillCount != null && (
          <Badge variant="neutral">
            <Icon.Sparkles aria-hidden />
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
      {stats && <div className="mt-2 text-xs text-subtle-foreground">{stats}</div>}
    </div>
  );
}
