/* "Learn": turn a finding into a team memory (SPEC-2026-10-12-memory).
   Clicking opens a modal that asks the server for an LLM draft, shows it in
   edit mode, and saves ONLY when the user clicks Save (or merges it into a
   similar existing memory). An already-learned finding opens that memory for
   editing instead. Hooks live in the dialog, which mounts only when opened. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
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
import { s } from "./styles";

export function LearnAction({ f }: { f: FindingRecord }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button kind="secondary" size="sm" icon="Brain" onClick={() => setOpen(true)}>
        {t("finding.learn")}
      </Button>
      {/* Portal: the card is dimmed (opacity) once decided, which would fade the dialog too. */}
      {open && createPortal(<LearnDialog f={f} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function LearnDialog({ f, onClose }: { f: FindingRecord; onClose: () => void }) {
  const t = useTranslations("memory");
  const { mutate: requestDraft, data, isPending, error } = useLearnDraft();
  const requested = React.useRef(false);
  React.useEffect(() => {
    // Once per open (StrictMode double-invokes effects in dev).
    if (requested.current) return;
    requested.current = true;
    requestDraft(f.id);
  }, [f.id, requestDraft]);

  const editing = !!data?.existing_memory_id;
  return (
    <Modal width={640} onClose={onClose}>
      <Modal.Header
        title={editing ? t("learn.editTitle") : t("learn.title")}
        subtitle={t("learn.subtitle")}
        onClose={onClose}
      />
      {data ? (
        <LearnDraftForm key={data.existing_memory_id ?? "new"} f={f} res={data} onClose={onClose} />
      ) : (
        <div style={s.dialogBody}>
          {isPending && <div>{t("learn.drafting")}</div>}
          {error && (
            <div role="alert" style={s.dialogError}>
              {t("learn.failed", { message: error.message })}
            </div>
          )}
        </div>
      )}
    </Modal>
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
      <div style={s.dialogBody}>
        {res.draft.fallback && (
          <div role="status" style={s.dialogNotice}>
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
          <div role="alert" style={s.dialogError}>
            {t("learn.failed", { message: failure.message })}
          </div>
        )}
      </div>
      <Modal.Footer>
        <div style={s.dialogFooter}>
          <Button kind="secondary" onClick={onClose} disabled={saving}>
            {t("learn.cancel")}
          </Button>
          <Button kind="primary" onClick={save} loading={saving} disabled={!isMemoryFormValid(value)}>
            {saving ? t("learn.saving") : t("learn.save")}
          </Button>
        </div>
      </Modal.Footer>
    </>
  );
}
