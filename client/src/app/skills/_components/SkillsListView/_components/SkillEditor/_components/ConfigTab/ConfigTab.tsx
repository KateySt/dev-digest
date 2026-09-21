"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CodeField, FormField, Select, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { slugify } from "@/lib/slug";
import { SKILL_TYPES } from "@/app/skills/_components/SkillsListView/constants";
import { isScanBlocking } from "@/app/skills/_components/SkillsListView/scan";
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

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body } },
      { onSuccess: (data) => toast.success(t("preview.version", { version: data.version })) },
    );

  const blocked = isScanBlocking(skill.scan_status, skill.scan_findings);
  const needsOverride = skill.scan_status === "flagged" && !blocked;

  const toggleEnabled = (enabled: boolean) => {
    if (enabled && blocked) return;
    if (enabled && needsOverride && !window.confirm(t("preview.enableOverrideConfirm"))) return;
    update.mutate(
      { id: skill.id, patch: { enabled, ...(needsOverride ? { override: true } : {}) } },
      { onError: () => toast.error(t("preview.enableBlockedError")) },
    );
  };

  const remove = () => {
    if (!window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;
    onDeleted();
    del.mutate(skill.id, { onError: () => toast.error(t("preview.deleteError")) });
  };

  return (
    <div style={s.wrap}>
      <FormField label={t("preview.enabled")} hint={blocked && !skill.enabled ? t("preview.enableBlockedHint") : undefined}>
        <div
          title={blocked && !skill.enabled ? t("preview.enableBlockedHint") : undefined}
          style={blocked && !skill.enabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          <Toggle on={skill.enabled} onChange={toggleEnabled} size={16} />
        </div>
      </FormField>
      <FormField label={t("file.nameLabel")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("preview.typeLabel")}>
        <Select value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("preview.descriptionLabel")} hint={t("preview.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
        <CodeField
          value={body}
          onChange={setBody}
          filename={`${slugify(name) || "skill"}.md`}
          dirty={body !== skill.body}
        />
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
