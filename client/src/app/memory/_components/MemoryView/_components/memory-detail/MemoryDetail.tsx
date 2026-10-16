/* Right panel of the Memory page (design + SPEC-2026-10-12-memory AC-27):
   kind badge, Edit / Delete, content, CONFIDENCE / SCOPE / UPDATED, links,
   path globs, source contexts, Archive. Edit reuses the Learn modal's form. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import type { Memory, MemoryInput } from "@devdigest/shared";
import { MemoryForm, isMemoryFormValid, type LinkOption } from "@/components/memory-form";
import { useDeleteMemory, useUpdateMemory } from "@/lib/hooks/memory";
import { MEMORY_CLASSES as M } from "../../constants";
import { memoryToInput } from "../../helpers";

const STAT_LABEL = "mb-1.5 text-2xs tracking-[0.6px] text-subtle-foreground";
const STAT_VALUE = "text-xl font-bold";
const SECTION = "flex flex-col gap-2";

export function MemoryDetail({
  m,
  repoId,
  agentOptions,
  skillOptions,
  onDeleted,
  onOpenMemory,
}: {
  m: Memory;
  /** The active repo — used if a global memory is switched to "This repo". */
  repoId: string | null;
  agentOptions: LinkOption[];
  skillOptions: LinkOption[];
  onDeleted: () => void;
  /** Select another memory (the "Merged into" link, AC-C22). */
  onOpenMemory: (id: string) => void;
}) {
  const t = useTranslations("memory");
  const [draft, setDraft] = React.useState<MemoryInput | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const update = useUpdateMemory();
  const del = useDeleteMemory();

  return (
    <section data-testid="memory-detail" className={M.detail}>
      <div className="flex items-center gap-2">
        <span className={M.badge}>{t(`kind.${m.kind}`)}</span>
        {m.unlinked && <span className={M.warnBadge}>{t("card.unlinked")}</span>}
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("detail.edit")}
            title={t("detail.edit")}
            onClick={() => setDraft(memoryToInput(m))}
          >
            <Icon.Edit aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:text-crit"
            aria-label={t("detail.delete")}
            title={t("detail.delete")}
            onClick={() => setConfirming(true)}
          >
            <Icon.Trash aria-hidden />
          </Button>
        </div>
      </div>

      {m.merged_into && (
        <div role="note" className="flex items-center justify-between gap-2 text-sm text-subtle-foreground">
          <span>{t("detail.mergedInto")}</span>
          <Button variant="secondary" size="sm" onClick={() => onOpenMemory(m.merged_into!)}>
            {t("detail.openMergedInto")}
          </Button>
        </div>
      )}

      {confirming && (
        <div role="alertdialog" className={M.confirm}>
          <div>{t("detail.confirmDelete")}</div>
          <div className={M.rowEnd}>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={del.isPending}>
              {t("detail.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={del.isPending}
              aria-label={t("detail.confirmDeleteAction")}
              onClick={() => del.mutate(m.id, { onSuccess: onDeleted })}
            >
              {del.isPending && <Icon.Loader className="animate-spin" aria-hidden />}
              {t("detail.delete")}
            </Button>
          </div>
        </div>
      )}

      {draft ? (
        <div>
          <MemoryForm
            value={draft}
            onChange={setDraft}
            repoId={m.repo_id ?? repoId}
            agentOptions={agentOptions}
            skillOptions={skillOptions}
          />
          <div className={M.rowEnd}>
            <Button variant="secondary" size="sm" onClick={() => setDraft(null)} disabled={update.isPending}>
              {t("detail.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={update.isPending || !isMemoryFormValid(draft)}
              onClick={() => update.mutate({ id: m.id, patch: draft }, { onSuccess: () => setDraft(null) })}
            >
              {update.isPending && <Icon.Loader className="animate-spin" aria-hidden />}
              {t("detail.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={M.content}>
          <Markdown>{m.content}</Markdown>
        </div>
      )}

      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 border-b border-border pb-4.5">
        <div>
          <div className={STAT_LABEL}>{t("detail.stat.confidence")}</div>
          <div className={STAT_VALUE}>{Math.round(m.confidence * 100)}%</div>
        </div>
        <div>
          <div className={STAT_LABEL}>{t("detail.stat.scope")}</div>
          <div className={STAT_VALUE}>{t(`scope.${m.scope}`)}</div>
        </div>
        <div>
          <div className={STAT_LABEL}>{t("detail.stat.updated")}</div>
          <div className={STAT_VALUE}>{m.updated_at.slice(0, 10)}</div>
        </div>
      </div>

      <div className={SECTION}>
        <div className={M.sectionLabel}>{t("detail.links")}</div>
        <div className={M.chipRow}>
          {m.applies_to_all_agents && <span className={M.badge}>{t("detail.allAgents")}</span>}
          {m.links.map((l) => (
            <span key={`${l.target_kind}:${l.target_id}`} className={M.badge}>
              {l.name}
            </span>
          ))}
        </div>
      </div>

      <div className={SECTION}>
        <div className={M.sectionLabel}>{t("detail.globs")}</div>
        <div className={M.chipRow}>
          {m.path_globs.length === 0 && <span className={M.muted}>{t("detail.anyFile")}</span>}
          {m.path_globs.map((g) => (
            <span key={g} className={M.prChip}>
              {g}
            </span>
          ))}
        </div>
      </div>

      <div className={SECTION}>
        <div className={M.sectionLabel}>{t("detail.sourceContexts")}</div>
        {m.sources.length === 0 && <span className={M.muted}>{t("detail.noSources")}</span>}
        {m.sources.map((src, i) => (
          <div key={i} className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5">
            {src.pr != null && (
              <span className={M.prChip}>
                {t("detail.prLabel", { pr: src.pr })}
              </span>
            )}
            <span className="text-ui wrap-anywhere text-subtle-foreground">{src.context}</span>
          </div>
        ))}
      </div>

      <div className={M.rowEnd}>
        <Button
          variant="secondary"
          size="sm"
          disabled={update.isPending && !draft}
          onClick={() => update.mutate({ id: m.id, patch: { archived: !m.archived_at } })}
        >
          {update.isPending && !draft && <Icon.Loader className="animate-spin" aria-hidden />}
          {m.archived_at ? t("detail.unarchive") : t("detail.archive")}
        </Button>
      </div>
    </section>
  );
}
