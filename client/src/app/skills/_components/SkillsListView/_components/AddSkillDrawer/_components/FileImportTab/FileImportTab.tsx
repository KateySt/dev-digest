"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Select, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { SKILL_TYPES } from "@/lib/skill-constants";
import { nameFromMarkdown } from "../../helpers";
import { s } from "../../styles";

/** From-file tab — reads the File client-side, no dedicated fetch hook.
 *  Always global (no project picker here — client spec non-goal: project
 *  scope is community-import-only). */
export function FileImportTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");

  const onFile = async (file: File) => {
    const text = await file.text();
    setBody(text);
    if (!name.trim()) setName(nameFromMarkdown(text, file.name.replace(/\.\w+$/, "")));
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = () =>
    create.mutate(
      { name: name.trim() || undefined, type, body, source: "manual" },
      {
        onSuccess: (skill) => {
          toast.success(t("file.success", { name: skill.name }));
          onClose();
        },
      },
    );

  return (
    <div style={s.form}>
      <FormField label="File">
        <input
          type="file"
          accept=".md,.markdown,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </FormField>
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
        <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
      </FormField>
      <FormField label={t("preview.typeLabel")}>
        <Select value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
        <Textarea value={body} onChange={setBody} rows={10} mono placeholder={t("file.bodyPlaceholder")} />
      </FormField>
      <Button kind="primary" icon="Upload" onClick={submit} disabled={!body.trim() || create.isPending}>
        {create.isPending ? t("file.importing") : t("file.import")}
      </Button>
    </div>
  );
}
