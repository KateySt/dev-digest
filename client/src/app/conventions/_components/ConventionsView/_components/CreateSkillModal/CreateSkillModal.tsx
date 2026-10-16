"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CodeField, FormField, Modal, Select, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { CONVENTION_UNAVAILABLE, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/contexts";
import { slugify } from "@/lib/slug";
import { SKILL_TYPES } from "@/lib/skill-constants";
import { buildSkillBody, buildSkillDescription, buildSkillName } from "../../helpers";
import { s } from "./styles";

type Scope = "repo" | "global";

/** "Create skill from conventions" modal — merges the selected candidates
 *  into one skill draft (name/description/body/type/enabled), fully editable
 *  before save, scoped to this project or global
 *  (SPEC-2026-10-16-convention-skills AC-16…AC-18). The server creates the
 *  skill with `source: "extracted"` and links the selected conventions to it;
 *  linking the skill to an agent happens afterward, via Agents → Skills. */
export function CreateSkillModal({
  repoId,
  repoFullName,
  selected,
  onClose,
  onCreated,
}: {
  repoId: string;
  repoFullName: string;
  selected: ConventionCandidate[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkillFromConventions();

  const [name, setName] = React.useState(() => buildSkillName(repoFullName));
  const [description, setDescription] = React.useState(() => buildSkillDescription(repoFullName, selected.length));
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() => buildSkillBody(repoFullName, selected));
  const [scope, setScope] = React.useState<Scope>("repo");

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: tSkills(`listItem.type.${v}`) }));
  const scopeOptions = [
    { value: "repo", label: t("modal.scope.project", { repo: repoFullName }) },
    { value: "global", label: t("modal.scope.global") },
  ];
  const unavailable = create.error instanceof ApiError && create.error.code === CONVENTION_UNAVAILABLE;

  const submit = () =>
    create.mutate(
      {
        repoId,
        input: {
          convention_ids: selected.map((c) => c.id),
          name: name.trim(),
          description: description.trim(),
          type,
          body,
          enabled,
          scope,
        },
      },
      {
        onSuccess: ({ skill }) => {
          const scopeLabel = skill.repo_id ? t("modal.successScopeProject") : t("modal.successScopeGlobal");
          toast.success(t("modal.success", { name: skill.name, scope: scopeLabel }));
          onCreated?.();
          onClose();
        },
      },
    );

  return (
    <Modal width={720} onClose={onClose}>
      <Modal.Header title={t("modal.title")} subtitle={name} onClose={onClose} />
      <div style={s.form}>
        <div style={s.banner}>
          {t("modal.mergedFrom", { count: selected.length, repo: repoFullName })}
        </div>
        {unavailable && (
          <div style={s.error} role="alert">
            {t("modal.unavailable")}
          </div>
        )}

        <FormField label={t("modal.nameLabel")} required>
          <TextInput value={name} onChange={setName} />
        </FormField>
        <FormField label={t("modal.descriptionLabel")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
          <FormField label={t("modal.typeLabel")}>
            <Select value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
          </FormField>
          <FormField label={t("modal.enabledLabel")} hint={t("modal.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} size={16} />
          </FormField>
        </div>
        <FormField
          label={t("modal.scope.label")}
          hint={scope === "repo" ? t("modal.scope.hintProject", { repo: repoFullName }) : t("modal.scope.hintGlobal")}
        >
          <Select value={scope} onChange={(v) => setScope(v as Scope)} options={scopeOptions} />
        </FormField>
        <FormField label={t("modal.bodyLabel")}>
          <CodeField value={body} onChange={setBody} filename={`${slugify(name) || "skill"}.md`} />
        </FormField>
      </div>

      <Modal.Footer>
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!name.trim() || !body.trim() || create.isPending}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
