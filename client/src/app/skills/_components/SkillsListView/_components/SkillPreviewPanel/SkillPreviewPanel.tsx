"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  ErrorState,
  FormField,
  SelectInput,
  Skeleton,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useSkill, useDeleteSkill, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { SKILL_TYPES } from "../../constants";
import { s } from "./styles";

export function SkillPreviewPanel({ skillId, onClosed }: { skillId: string; onClosed: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(skillId);
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading || !skill) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={160} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <ErrorState
        title={notFound ? t("detail.notFound.title") : undefined}
        body={notFound ? t("detail.notFound.body") : t("detail.loadError")}
        onRetry={notFound ? undefined : () => refetch()}
      />
    );
  }

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("preview.version", { version: data.version })) },
    );

  const remove = () => {
    if (!window.confirm(`Delete skill "${skill.name}"? This cannot be undone.`)) return;
    del.mutate(skill.id, { onSuccess: onClosed });
  };

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{skill.name}</h2>
        <Badge color="var(--text-secondary)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>

      {skill.source !== "manual" && <div style={s.untrustedNotice}>{t("preview.untrustedNotice")}</div>}

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
          Delete
        </Button>
      </div>
    </div>
  );
}
