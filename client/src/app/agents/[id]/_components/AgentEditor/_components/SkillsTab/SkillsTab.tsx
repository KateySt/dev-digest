"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkillLinks, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "./constants";
import { filterSkills, initialOrder, reorder } from "./helpers";
import { s } from "./styles";

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
      <div style={s.wrap}>
        <Skeleton height={40} />
        <Skeleton height={200} />
      </div>
    );
  }

  const visibleOrder = filterSkills(skills ?? [], filter).map((sk) => sk.id);
  const visibleSet = new Set(visibleOrder);
  const rows = order.filter((id) => visibleSet.has(id) && byId.has(id));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">
          {t("skills.enabledCount", { linked: linkedIds.size, total: skills?.length ?? 0 })}
        </Badge>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.filter}>
        <Icon.Search size={13} style={s.filterIcon} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          style={s.filterInput}
        />
      </div>

      {rows.length === 0 ? (
        <div style={s.empty}>{t("skills.noMatch")}</div>
      ) : (
        <div style={s.list}>
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
                style={s.row(dragId === id, overId === id && dragId !== id)}
              >
                <span style={s.handle}>
                  <Icon.Menu size={14} />
                </span>
                <Checkbox checked={checked} onChange={(v) => toggle(id, v)} />
                <span style={s.name}>{skill.name}</span>
                <Badge color={SKILL_TYPE_COLOR[skill.type]}>{skill.type}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
