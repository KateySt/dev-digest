/* "Learn": turn a finding into a team memory (SPEC-2026-10-12-memory).
   Clicking opens a modal that asks the server for an LLM draft, shows it in
   edit mode, and saves ONLY when the user clicks Save (or merges it into a
   similar existing memory). An already-learned finding opens that memory for
   editing instead. Hooks live in the dialog, which mounts only when opened. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FindingRecord, LearnDraftResponse, MemoryInput } from "@devdigest/shared";
import { MemoryForm, isMemoryFormValid } from "@/components/memory-form";
import { useAgents } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import {
  useCreateMemory,
  useLearnDraft,
  useMergeMemory,
  useSimilarMemories,
  useUpdateMemory,
} from "@/lib/hooks/memory";

const BODY = "flex flex-col gap-2 px-6 py-4";
const ERROR = "min-w-0 text-sm text-crit wrap-anywhere";

export function LearnAction({ f }: { f: FindingRecord }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Icon.Brain aria-hidden />
        {t("finding.learn")}
      </Button>
      {/* The dialog portals to <body>, so the dimmed (decided) card does not fade it. */}
      {open && <LearnDialog f={f} onClose={() => setOpen(false)} />}
    </>
  );
}

function LearnDialog({ f, onClose }: { f: FindingRecord; onClose: () => void }) {
  const t = useTranslations("memory");
  const { data, isPending, error } = useLearnDraft(f.id);

  const editing = !!data?.existing_memory_id;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{editing ? t("learn.editTitle") : t("learn.title")}</DialogTitle>
          <DialogDescription>{t("learn.subtitle")}</DialogDescription>
        </DialogHeader>
      {data ? (
        <LearnDraftForm key={data.existing_memory_id ?? "new"} f={f} res={data} onClose={onClose} />
      ) : (
        <DialogBody className={BODY}>
          {isPending && <div>{t("learn.drafting")}</div>}
          {error && (
            <div role="alert" className={ERROR}>
              {t("learn.failed", { message: error.message })}
            </div>
          )}
        </DialogBody>
      )}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted once the draft exists, so the editable copy is seeded exactly once. */
function LearnDraftForm({ f, res, onClose }: { f: FindingRecord; res: LearnDraftResponse; onClose: () => void }) {
  const t = useTranslations("memory");
  const { fallback: _fallback, ...initial } = res.draft;
  const [value, setValue] = React.useState<MemoryInput>(initial);
  const existingId = res.existing_memory_id;

  const agents = useAgents();
  const skills = useSkills();
  // Always the PR's repo (+ global), even if the user picks "All repos": a
  // finding must never be merged into another repo's memory (AC-9).
  const similarQuery = useSimilarMemories(value.content, res.draft.repo_id);
  const similar = (similarQuery.data ?? res.similar).filter((m) => m.id !== existingId);

  const create = useCreateMemory();
  const update = useUpdateMemory();
  const merge = useMergeMemory();
  const saving = create.isPending || update.isPending || merge.isPending;
  const failure = create.error ?? update.error ?? merge.error;

  const save = () => {
    if (existingId) update.mutate({ id: existingId, patch: value }, { onSuccess: onClose });
    else create.mutate({ ...value, finding_id: f.id }, { onSuccess: onClose });
  };
  const mergeInto = (id: string) =>
    merge.mutate(
      { id, body: { content: value.content, confidence: value.confidence, finding_id: f.id } },
      { onSuccess: onClose },
    );

  const skillOptions = (skills.data ?? [])
    .filter((sk) => !sk.repo_id || sk.repo_id === value.repo_id)
    .map((sk) => ({ id: sk.id, name: sk.name }));

  return (
    <>
      <DialogBody className={BODY}>
        {res.draft.fallback && (
          <div role="status" className="mb-2 rounded-[7px] border border-warn px-3 py-2 text-sm text-warn">
            {t("learn.fallback")}
          </div>
        )}
        <MemoryForm
          value={value}
          onChange={setValue}
          repoId={res.draft.repo_id}
          agentOptions={(agents.data ?? []).map((a) => ({ id: a.id, name: a.name }))}
          skillOptions={skillOptions}
          similar={existingId ? [] : similar}
          onMerge={existingId ? undefined : mergeInto}
          mergePending={saving}
          readOnlySource={res.source}
        />
        {failure && (
          <div role="alert" className={ERROR}>
            {t("learn.failed", { message: failure.message })}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          {t("learn.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || !isMemoryFormValid(value)}>
          {saving && <Icon.Loader className="animate-spin" aria-hidden />}
          {saving ? t("learn.saving") : t("learn.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
