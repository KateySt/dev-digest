"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CodeField, FormField, Modal, Select, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { slugify } from "@/lib/slug";
import { SKILL_TYPES } from "@/app/skills/_components/SkillsListView/constants";
import { buildSkillBody, buildSkillDescription, buildSkillName } from "../../helpers";
import { s } from "./styles";

/** "Create skill from conventions" modal — merges the accepted candidates
 *  into one skill draft (name/description/body/type/enabled), fully editable
 *  before save. Created with `source: "extracted"`; linking it to an agent
 *  happens afterward, via the existing Agents → Skills tab. */
export function CreateSkillModal({
  repoFullName,
  accepted,
  onClose,
  onCreated,
}: {
  repoFullName: string;
  accepted: ConventionCandidate[];
  onClose: () => void;
  onCreated?: () => void;
}) {
  const t = useTranslations("conventions");
  const tSkills = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();

  const [name, setName] = React.useState(() => buildSkillName(repoFullName));
  const [description, setDescription] = React.useState(() => buildSkillDescription(repoFullName, accepted.length));
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState(() => buildSkillBody(repoFullName, accepted));

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: tSkills(`listItem.type.${v}`) }));

  const submit = () =>
    create.mutate(
      { name: name.trim(), description: description.trim(), type, body, enabled, source: "extracted" },
      {
        onSuccess: (skill) => {
          toast.success(t("modal.success", { name: skill.name }));
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
          {t("modal.mergedFrom", { count: accepted.length, repo: repoFullName })}
        </div>

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
