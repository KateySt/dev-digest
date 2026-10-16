"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { SKILL_TYPE_BADGE } from "@/lib/skill-constants";
import { cn } from "@/lib/utils";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { filterSkills, initialOrder, reorder } from "./helpers";

/** Skills tab — attach/detach/reorder the workspace's skills for this agent.
 *  Order matters: it becomes the order of the assembled `## Skills / rules`
 *  prompt block. Saves are optimistic-on-action (same idiom as AgentCard's
 *  enabled toggle) — no separate Save button. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading } = useSkills();
  const { data: links } = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills();

  const [order, setOrder] = React.useState<string[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

  // Seed local order from the server once both queries have landed; re-seed
  // when switching agents.
  React.useEffect(() => {
    setOrder(null);
  }, [agent.id]);
  React.useEffect(() => {
    if (order === null && skills && links) {
      setOrder(initialOrder(skills, links));
    }
  }, [order, skills, links]);

  const linkedIds = React.useMemo(() => new Set((links ?? []).map((l) => l.skill_id)), [links]);
  const byId = React.useMemo(() => new Map((skills ?? []).map((sk) => [sk.id, sk])), [skills]);

  const save = (nextOrder: string[], nextLinked: Set<string>) => {
    const skillIds = nextOrder.filter((id) => nextLinked.has(id));
    setSkills.mutate({ agentId: agent.id, skillIds });
  };

  const toggle = (id: string, checked: boolean) => {
    if (!order) return;
    const nextLinked = new Set(linkedIds);
    if (checked) nextLinked.add(id);
    else nextLinked.delete(id);
    save(order, nextLinked);
  };

  const onDrop = (targetId: string) => {
    setOverId(null);
    if (!order || !dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const nextOrder = reorder(order, dragId, targetId);
    setOrder(nextOrder);
    setDragId(null);
    save(nextOrder, linkedIds);
  };

  if (isLoading || order === null) {
    return (
      <div className="flex max-w-[760px] flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-50 w-full" />
      </div>
    );
  }

  const visibleOrder = filterSkills(skills ?? [], filter).map((sk) => sk.id);
  const visibleSet = new Set(visibleOrder);
  const rows = order.filter((id) => visibleSet.has(id) && byId.has(id));

  return (
    <div className="max-w-[760px]">
      <div className="mb-1.5 flex items-center gap-2.5">
        <h2 className="text-xl font-bold">{t("skills.title")}</h2>
        <Badge variant="brand">
          {t("skills.enabledCount", { linked: linkedIds.size, total: skills?.length ?? 0 })}
        </Badge>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{t("skills.orderHint")}</p>

      <div className="mb-4 flex items-center gap-2.5 rounded-[7px] border border-border bg-surface px-3 py-2">
        <Icon.Search size={13} className="text-subtle-foreground" aria-hidden />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          aria-label={t("skills.filterPlaceholder")}
          className="flex-1 border-none bg-transparent text-sm text-foreground outline-none"
        />
      </div>

      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-subtle-foreground">{t("skills.noMatch")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((id) => {
            const skill = byId.get(id)!;
            const checked = linkedIds.has(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={() => setDragId(id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overId !== id) setOverId(id);
                }}
                onDragLeave={() => setOverId((cur) => (cur === id ? null : cur))}
                onDrop={() => onDrop(id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-surface px-3 py-2.5",
                  overId === id && dragId !== id ? "border-primary" : "border-border",
                  dragId === id && "opacity-50",
                )}
              >
                <span className="inline-flex shrink-0 cursor-grab text-subtle-foreground">
                  <Icon.Menu size={14} aria-hidden />
                </span>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => toggle(id, v === true)}
                  aria-label={skill.name}
                />
                <span className="flex-1 text-base font-medium">{skill.name}</span>
                <Badge variant={SKILL_TYPE_BADGE[skill.type]}>{skill.type}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
