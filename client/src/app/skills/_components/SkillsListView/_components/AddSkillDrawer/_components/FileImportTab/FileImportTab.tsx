"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/contexts";
import { SKILL_TYPES } from "@/lib/skill-constants";
import { FORM } from "../../constants";
import { nameFromMarkdown } from "../../helpers";

/** From-file tab — reads the File client-side, no dedicated fetch hook.
 *  Always global (no project picker here — client spec non-goal: project
 *  scope is community-import-only). */
export function FileImportTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const id = React.useId();
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
    <div className={FORM}>
      <FormField label={t("file.fileLabel")} htmlFor={`${id}-file`}>
        <input
          id={`${id}-file`}
          type="file"
          accept=".md,.markdown,.txt"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </FormField>
      <FormField label={t("file.nameLabel")} hint={t("file.nameHint")} htmlFor={`${id}-name`}>
        <Input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("file.namePlaceholder")}
        />
      </FormField>
      <FormField label={t("preview.typeLabel")}>
        <SelectField
          value={type}
          onChange={(v) => setType(v as SkillType)}
          options={typeOptions}
          ariaLabel={t("preview.typeLabel")}
        />
      </FormField>
      <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")} htmlFor={`${id}-body`}>
        <Textarea
          id={`${id}-body`}
          className="mono"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder={t("file.bodyPlaceholder")}
        />
      </FormField>
      <Button onClick={submit} disabled={!body.trim() || create.isPending}>
        {create.isPending ? <Icon.Loader className="animate-spin" aria-hidden /> : <Icon.Upload aria-hidden />}
        {create.isPending ? t("file.importing") : t("file.import")}
      </Button>
    </div>
  );
}
