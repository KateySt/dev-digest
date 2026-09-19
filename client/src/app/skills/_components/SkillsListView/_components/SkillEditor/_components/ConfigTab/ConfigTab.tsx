"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { SKILL_TYPES } from "@/app/skills/_components/SkillsListView/constants";
import { s } from "./styles";

/** Config tab — name/description/type/body + enabled toggle. Save bumps the
 *  skill's version when the body changed (server-side rule); Delete removes
 *  the skill entirely. */
export function ConfigTab({ skill, onDeleted }: { skill: Skill; onDeleted: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("preview.version", { version: data.version })) },
    );

  const remove = () => {
    if (!window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;
    del.mutate(skill.id, { onSuccess: onDeleted });
  };

  return (
    <div style={s.wrap}>
      <FormField label={t("preview.enabled")}>
        <Toggle on={enabled} onChange={setEnabled} size={16} />
      </FormField>
      <FormField label={t("file.nameLabel")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("preview.typeLabel")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("preview.descriptionLabel")} hint={t("preview.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={14} mono />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {t("preview.save")}
        </Button>
        <Button kind="ghost" icon="Trash" onClick={remove} disabled={del.isPending}>
          {t("preview.delete")}
        </Button>
      </div>
    </div>
  );
}
