/* One retirement proposal in the Curate drawer (SPEC-2026-10-12-memory-curation
   AC-C14, AC-C19, AC-C20): reasons + Archive / Keep / Edit / Delete. Each
   action is its own request; `onDone` drops the proposal from the drawer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import type { MemoryInput, StaleCandidate } from "@devdigest/shared";
import { MemoryForm, isMemoryFormValid, type LinkOption } from "@/components/memory-form";
import { useDeleteMemory, useKeepMemory, useUpdateMemory } from "@/lib/hooks/memory";
import { memoryToInput } from "@/app/memory/_components/MemoryView/helpers";
import { MEMORY_CLASSES as page } from "@/app/memory/_components/MemoryView/constants";
import { CURATE_CLASSES as s } from "../../constants";

export function StaleItem({
  candidate,
  repoId,
  agentOptions,
  skillOptions,
  onDone,
}: {
  candidate: StaleCandidate;
  repoId: string | null;
  agentOptions: LinkOption[];
  skillOptions: LinkOption[];
  onDone: () => void;
}) {
  const t = useTranslations("memory.curate");
  const m = candidate.memory;
  const [draft, setDraft] = React.useState<MemoryInput | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const update = useUpdateMemory();
  const keep = useKeepMemory();
  const del = useDeleteMemory();
  const busy = update.isPending || keep.isPending || del.isPending;

  return (
    <article className={s.item}>
      <div className={page.chipRow}>
        {candidate.reasons.map((r) => (
          <span key={r} className={page.warnBadge}>
            {t(`reason.${r}`)}
          </span>
        ))}
      </div>

      {draft ? (
        <div>
          <MemoryForm
            value={draft}
            onChange={setDraft}
            repoId={m.repo_id ?? repoId}
            agentOptions={agentOptions}
            skillOptions={skillOptions}
          />
          <div className={page.rowEnd}>
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={update.isPending}>
              {t("action.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={update.isPending || !isMemoryFormValid(draft)}
              onClick={() => update.mutate({ id: m.id, patch: draft }, { onSuccess: onDone })}
            >
              {update.isPending && <Icon.Loader className="animate-spin" aria-hidden />}
              {t("action.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={page.content}>
          <Markdown>{m.content}</Markdown>
        </div>
      )}

      {confirming && (
        <div role="alertdialog" className={page.confirm}>
          <div>{t("action.confirmDelete")}</div>
          <div className={page.rowEnd}>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={del.isPending}>
              {t("action.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={del.isPending}
              aria-label={t("action.confirmDeleteAction")}
              onClick={() => del.mutate(m.id, { onSuccess: onDone })}
            >
              {del.isPending && <Icon.Loader className="animate-spin" aria-hidden />}
              {t("action.delete")}
            </Button>
          </div>
        </div>
      )}

      {!draft && !confirming && (
        <div className={page.rowEnd}>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => update.mutate({ id: m.id, patch: { archived: true } }, { onSuccess: onDone })}
          >
            {t("action.archive")}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => keep.mutate(m.id, { onSuccess: onDone })}>
            {t("action.keep")}
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setDraft(memoryToInput(m))}>
            {t("action.edit")}
          </Button>
          <Button variant="destructive" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
            {t("action.delete")}
          </Button>
        </div>
      )}
    </article>
  );
}
