/* One duplicate group in the Curate drawer (SPEC-2026-10-12-memory-curation
   AC-C10..AC-C17). The user narrows the group, picks the primary, edits the
   LLM-drafted merged memory and applies it. Nothing is written before Apply. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import type { CurateGroup, MemoryInput } from "@devdigest/shared";
import { MemoryForm, isMemoryFormValid, type LinkOption } from "@/components/memory-form";
import { ApiError } from "@/lib/api";
import { useCurateMerge, useMergeDraft } from "@/lib/hooks/memory";
import { MEMORY_CLASSES as page } from "@/app/memory/_components/MemoryView/constants";
import { cn } from "@/lib/utils";
import { CURATE_CLASSES as s } from "../../constants";
import { mergeDefaults } from "../../helpers";

export function MergeGroup({
  group,
  repoId,
  agentOptions,
  skillOptions,
  onDone,
  onConflict,
}: {
  group: CurateGroup;
  repoId: string | null;
  agentOptions: LinkOption[];
  skillOptions: LinkOption[];
  /** The group was applied, or narrowed below two members. */
  onDone: () => void;
  /** A member changed since the scan (409). */
  onConflict: () => void;
}) {
  const t = useTranslations("memory");
  const [memberIds, setMemberIds] = React.useState(() => group.members.map((m) => m.id));
  const [primaryId, setPrimaryId] = React.useState(group.primary_id);
  const [form, setForm] = React.useState<MemoryInput | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { mutate: requestDraft, data: draft, isError: draftFailed, isPending: drafting, reset: resetDraft } = useMergeDraft();
  const merge = useCurateMerge();

  const members = group.members.filter((m) => memberIds.includes(m.id));

  const closeForm = () => {
    setForm(null);
    setError(null);
    resetDraft();
  };

  const remove = (id: string) => {
    const rest = memberIds.filter((m) => m !== id);
    if (rest.length < 2) return onDone();
    setMemberIds(rest);
    if (id === primaryId) setPrimaryId(rest[0]!);
    closeForm();
  };

  const openForm = () => {
    setForm(mergeDefaults(members, primaryId, repoId));
    requestDraft(
      { memberIds },
      // On fallback the form already holds the user's chosen primary's text —
      // the server's fallback uses its own primary pick (AC-C12).
      { onSuccess: (r) => !r.fallback && setForm((cur) => (cur ? { ...cur, content: r.content } : cur)) },
    );
  };

  const apply = (result: MemoryInput) => {
    setError(null);
    merge.mutate(
      {
        ...(repoId ? { repo_id: repoId } : {}),
        primary_id: primaryId,
        member_ids: memberIds,
        expected: Object.fromEntries(members.map((m) => [m.id, m.updated_at])),
        result,
      },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) onConflict();
          else setError(err.message);
        },
      },
    );
  };

  return (
    <article className={s.item}>
      <div className={page.chipRow}>
        <span className={page.badge}>{t("curate.group.similarity", { pct: Math.round(group.similarity * 100) })}</span>
      </div>

      {members.map((m) => (
        <div
          key={m.id}
          className={cn(
            "flex flex-col gap-1.5 border-l-[3px] pl-2.5",
            m.id === primaryId ? "border-l-primary" : "border-l-border",
          )}
        >
          <div className={page.chipRow}>
            <span className={page.badge}>{t(`kind.${m.kind}`)}</span>
            <span className={page.badge}>{t(`scope.${m.scope}`)}</span>
            <span className={page.badge}>{t("card.confidence", { pct: Math.round(m.confidence * 100) })}</span>
            {m.applies_to_all_agents && <span className={page.badge}>{t("detail.allAgents")}</span>}
            {m.links.map((l) => (
              <span key={`${l.target_kind}:${l.target_id}`} className={page.badge}>
                {l.name}
              </span>
            ))}
            <span className={page.muted}>{m.last_used_at ? m.last_used_at.slice(0, 10) : t("card.neverUsed")}</span>
          </div>
          <div className={page.content}>
            <Markdown>{m.content}</Markdown>
          </div>
          <div className={page.rowEnd}>
            {m.id === primaryId ? (
              <span className={page.badge}>{t("curate.group.primary")}</span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={merge.isPending}
                onClick={() => {
                  setPrimaryId(m.id);
                  closeForm();
                }}
              >
                {t("curate.group.makePrimary")}
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={merge.isPending} onClick={() => remove(m.id)}>
              {t("curate.group.remove")}
            </Button>
          </div>
        </div>
      ))}

      {form ? (
        <div>
          {drafting && <div className={page.muted}>{t("curate.group.drafting")}</div>}
          {(draft?.fallback || draftFailed) && (
            <div role="status" className={s.notice}>
              {t("curate.group.fallback")}
            </div>
          )}
          <MemoryForm value={form} onChange={setForm} repoId={repoId} agentOptions={agentOptions} skillOptions={skillOptions} />
          <div className={page.muted}>{t("curate.group.hint")}</div>
          {error && (
            <div role="alert" className={s.error}>
              {error}
            </div>
          )}
          <div className={page.rowEnd}>
            <Button variant="secondary" size="sm" onClick={closeForm} disabled={merge.isPending}>
              {t("curate.action.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={merge.isPending || drafting || !isMemoryFormValid(form)}
              onClick={() => apply(form)}
            >
              {merge.isPending && <Icon.Loader className="animate-spin" aria-hidden />}
              {t("curate.group.apply")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={page.rowEnd}>
          <Button size="sm" onClick={openForm}>
            {t("curate.group.merge")}
          </Button>
        </div>
      )}
    </article>
  );
}
