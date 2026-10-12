/* One duplicate group in the Curate drawer (SPEC-2026-10-12-memory-curation
   AC-C10..AC-C17). The user narrows the group, picks the primary, edits the
   LLM-drafted merged memory and applies it. Nothing is written before Apply. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Markdown } from "@devdigest/ui";
import type { CurateGroup, MemoryInput } from "@devdigest/shared";
import { MemoryForm, isMemoryFormValid, type LinkOption } from "@/components/memory-form";
import { ApiError } from "@/lib/api";
import { useCurateMerge, useMergeDraft } from "@/lib/hooks/memory";
import { s as page } from "@/app/memory/_components/MemoryView/styles";
import { mergeDefaults } from "../../helpers";
import { s } from "../../styles";

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
    <article style={s.item}>
      <div style={page.chipRow}>
        <span style={page.badge}>{t("curate.group.similarity", { pct: Math.round(group.similarity * 100) })}</span>
      </div>

      {members.map((m) => (
        <div key={m.id} style={s.member(m.id === primaryId)}>
          <div style={page.chipRow}>
            <span style={page.badge}>{t(`kind.${m.kind}`)}</span>
            <span style={page.badge}>{t(`scope.${m.scope}`)}</span>
            <span style={page.badge}>{t("card.confidence", { pct: Math.round(m.confidence * 100) })}</span>
            {m.applies_to_all_agents && <span style={page.badge}>{t("detail.allAgents")}</span>}
            {m.links.map((l) => (
              <span key={`${l.target_kind}:${l.target_id}`} style={page.badge}>
                {l.name}
              </span>
            ))}
            <span style={page.muted}>{m.last_used_at ? m.last_used_at.slice(0, 10) : t("card.neverUsed")}</span>
          </div>
          <div style={page.content}>
            <Markdown>{m.content}</Markdown>
          </div>
          <div style={page.rowEnd}>
            {m.id === primaryId ? (
              <span style={page.badge}>{t("curate.group.primary")}</span>
            ) : (
              <Button kind="secondary" size="sm" disabled={merge.isPending} onClick={() => { setPrimaryId(m.id); closeForm(); }}>
                {t("curate.group.makePrimary")}
              </Button>
            )}
            <Button kind="secondary" size="sm" disabled={merge.isPending} onClick={() => remove(m.id)}>
              {t("curate.group.remove")}
            </Button>
          </div>
        </div>
      ))}

      {form ? (
        <div>
          {drafting && <div style={page.muted}>{t("curate.group.drafting")}</div>}
          {(draft?.fallback || draftFailed) && (
            <div role="status" style={s.notice}>
              {t("curate.group.fallback")}
            </div>
          )}
          <MemoryForm value={form} onChange={setForm} repoId={repoId} agentOptions={agentOptions} skillOptions={skillOptions} />
          <div style={page.muted}>{t("curate.group.hint")}</div>
          {error && (
            <div role="alert" style={s.error}>
              {error}
            </div>
          )}
          <div style={page.rowEnd}>
            <Button kind="secondary" size="sm" onClick={closeForm} disabled={merge.isPending}>
              {t("curate.action.cancel")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              loading={merge.isPending}
              disabled={drafting || !isMemoryFormValid(form)}
              onClick={() => apply(form)}
            >
              {t("curate.group.apply")}
            </Button>
          </div>
        </div>
      ) : (
        <div style={page.rowEnd}>
          <Button kind="primary" size="sm" onClick={openForm}>
            {t("curate.group.merge")}
          </Button>
        </div>
      )}
    </article>
  );
}
