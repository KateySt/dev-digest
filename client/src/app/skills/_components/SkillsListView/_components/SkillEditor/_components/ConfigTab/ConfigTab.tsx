"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CodeField, FormField, Select, TextInput, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useRepos } from "@/lib/hooks";
import { useToast } from "@/lib/contexts";
import { slugify } from "@/lib/slug";
import { SKILL_TYPES } from "@/lib/skill-constants";
import { isScanBlocking } from "@/lib/skill-scan";
import { s } from "./styles";

/** Config tab — name/description/type/body + enabled toggle. Save bumps the
 *  skill's version when the body changed (server-side rule); Delete removes
 *  the skill entirely.
 *
 *  `body` is CONTROLLED by the Skill Editor (not local state) so the unsaved
 *  text survives tab switches and the header's "Run on evals" can run it as a
 *  draft; `onSaved` lets the editor drop the draft once it's persisted. */
/** Sentinel for "global" in the project-scope Select — `Select` only carries
 *  string values, and `Skill.repo_id`'s real "global" value is `null`. */
const GLOBAL_SCOPE = "__global__";

export function ConfigTab({
  skill,
  body,
  onBodyChange,
  onSaved,
  onDeleted,
}: {
  skill: Skill;
  body: string;
  onBodyChange: (body: string) => void;
  onSaved?: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const { data: repos } = useRepos();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body } },
      {
        onSuccess: (data) => {
          toast.success(t("preview.version", { version: data.version }));
          onSaved?.();
        },
      },
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

  // Project scope reassignment (2026-10-02 amendment) — fires immediately on
  // change, like the Enabled toggle above, rather than bundled into Save:
  // it's a distinct administrative action (AC-44: never bumps version, never
  // re-runs the scan), not a content edit.
  const scopeOptions = [
    { value: GLOBAL_SCOPE, label: t("preview.scope.global") },
    ...(repos ?? []).map((r) => ({ value: r.id, label: r.full_name })),
  ];
  const changeScope = (value: string) => {
    const repoId = value === GLOBAL_SCOPE ? null : value;
    if (repoId === (skill.repo_id ?? null)) return;
    update.mutate(
      { id: skill.id, patch: { repo_id: repoId } },
      { onError: () => toast.error(t("preview.scope.reassignError")) },
    );
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
      <FormField label={t("preview.scope.label")} hint={t("preview.scope.hint")}>
        <Select
          value={skill.repo_id ?? GLOBAL_SCOPE}
          onChange={changeScope}
          options={scopeOptions}
          mono={false}
        />
      </FormField>
      <FormField label={t("preview.descriptionLabel")} hint={t("preview.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("preview.bodyLabel")} hint={t("preview.bodyHint")}>
        <CodeField
          value={body}
          onChange={onBodyChange}
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
