/* Right panel of the Memory page (design + SPEC-2026-10-12-memory AC-27):
   kind badge, Edit / Delete, content, CONFIDENCE / SCOPE / UPDATED, links,
   path globs, source contexts, Archive. Edit reuses the Learn modal's form. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, Markdown } from "@devdigest/ui";
import type { Memory, MemoryInput } from "@devdigest/shared";
import { MemoryForm, isMemoryFormValid, type LinkOption } from "@/components/memory-form";
import { useDeleteMemory, useUpdateMemory } from "@/lib/hooks/memory";
import { memoryToInput } from "../../helpers";
import { s } from "../../styles";

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
    <section data-testid="memory-detail" style={s.detail}>
      <div style={s.detailTop}>
        <span style={s.badge}>{t(`kind.${m.kind}`)}</span>
        {m.unlinked && <span style={s.warnBadge}>{t("card.unlinked")}</span>}
        <div style={s.detailActions}>
          <IconBtn icon="Edit" label={t("detail.edit")} onClick={() => setDraft(memoryToInput(m))} />
          <IconBtn icon="Trash" label={t("detail.delete")} danger onClick={() => setConfirming(true)} />
        </div>
      </div>

      {m.merged_into && (
        <div role="note" style={s.mergedNote}>
          <span>{t("detail.mergedInto")}</span>
          <Button kind="secondary" size="sm" onClick={() => onOpenMemory(m.merged_into!)}>
            {t("detail.openMergedInto")}
          </Button>
        </div>
      )}

      {confirming && (
        <div role="alertdialog" style={s.confirm}>
          <div>{t("detail.confirmDelete")}</div>
          <div style={s.rowEnd}>
            <Button kind="secondary" size="sm" onClick={() => setConfirming(false)} disabled={del.isPending}>
              {t("detail.cancel")}
            </Button>
            <Button
              kind="danger"
              size="sm"
              loading={del.isPending}
              aria-label={t("detail.confirmDeleteAction")}
              onClick={() => del.mutate(m.id, { onSuccess: onDeleted })}
            >
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
          <div style={s.rowEnd}>
            <Button kind="secondary" size="sm" onClick={() => setDraft(null)} disabled={update.isPending}>
              {t("detail.cancel")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              loading={update.isPending}
              disabled={!isMemoryFormValid(draft)}
              onClick={() => update.mutate({ id: m.id, patch: draft }, { onSuccess: () => setDraft(null) })}
            >
              {t("detail.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div style={s.content}>
          <Markdown>{m.content}</Markdown>
        </div>
      )}

      <div style={s.stats}>
        <div>
          <div style={s.statLabel}>{t("detail.stat.confidence")}</div>
          <div style={s.statValue}>{Math.round(m.confidence * 100)}%</div>
        </div>
        <div>
          <div style={s.statLabel}>{t("detail.stat.scope")}</div>
          <div style={s.statValue}>{t(`scope.${m.scope}`)}</div>
        </div>
        <div>
          <div style={s.statLabel}>{t("detail.stat.updated")}</div>
          <div style={s.statValue}>{m.updated_at.slice(0, 10)}</div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.railLabel}>{t("detail.links")}</div>
        <div style={s.chipRow}>
          {m.applies_to_all_agents && <span style={s.badge}>{t("detail.allAgents")}</span>}
          {m.links.map((l) => (
            <span key={`${l.target_kind}:${l.target_id}`} style={s.badge}>
              {l.name}
            </span>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.railLabel}>{t("detail.globs")}</div>
        <div style={s.chipRow}>
          {m.path_globs.length === 0 && <span style={s.muted}>{t("detail.anyFile")}</span>}
          {m.path_globs.map((g) => (
            <span key={g} className="mono" style={s.prChip}>
              {g}
            </span>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.railLabel}>{t("detail.sourceContexts")}</div>
        {m.sources.length === 0 && <span style={s.muted}>{t("detail.noSources")}</span>}
        {m.sources.map((src, i) => (
          <div key={i} style={s.sourceBox}>
            {src.pr != null && (
              <span className="mono" style={s.prChip}>
                {t("detail.prLabel", { pr: src.pr })}
              </span>
            )}
            <span style={s.sourceMeta}>{src.context}</span>
          </div>
        ))}
      </div>

      <div style={s.rowEnd}>
        <Button
          kind="secondary"
          size="sm"
          loading={update.isPending && !draft}
          onClick={() => update.mutate({ id: m.id, patch: { archived: !m.archived_at } })}
        >
          {m.archived_at ? t("detail.unarchive") : t("detail.archive")}
        </Button>
      </div>
    </section>
  );
}
