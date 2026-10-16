"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ConventionCandidate, SkillType } from "@devdigest/shared";
import { CodeField } from "@/components/code-field";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { CONVENTION_UNAVAILABLE, useCreateSkillFromConventions } from "@/lib/hooks/conventions";
import { useToast } from "@/lib/contexts";
import { slugify } from "@/lib/slug";
import { SKILL_TYPES } from "@/lib/skill-constants";
import { buildSkillBody, buildSkillDescription, buildSkillName } from "../../helpers";

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
  const nameId = React.useId();
  const descriptionId = React.useId();
  const enabledId = React.useId();

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("modal.title")}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3.5 px-6 py-5">
          <div className="mb-4 rounded-lg bg-accent px-3.5 py-2.5 text-sm text-muted-foreground">
            {t("modal.mergedFrom", { count: selected.length, repo: repoFullName })}
          </div>
          {unavailable && (
            <div className="mb-4 rounded-lg border border-crit px-3.5 py-2.5 text-sm text-crit" role="alert">
              {t("modal.unavailable")}
            </div>
          )}

          <FormField label={t("modal.nameLabel")} required htmlFor={nameId}>
            <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={t("modal.descriptionLabel")} htmlFor={descriptionId}>
            <Input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <div className="flex items-end gap-5">
            <FormField label={t("modal.typeLabel")}>
              <SelectField
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={typeOptions}
                ariaLabel={t("modal.typeLabel")}
              />
            </FormField>
            <FormField label={t("modal.enabledLabel")} hint={t("modal.enabledHint")} htmlFor={enabledId}>
              <Switch id={enabledId} checked={enabled} onCheckedChange={setEnabled} />
            </FormField>
          </div>
          <FormField
            label={t("modal.scope.label")}
            hint={scope === "repo" ? t("modal.scope.hintProject", { repo: repoFullName }) : t("modal.scope.hintGlobal")}
          >
            <SelectField
              value={scope}
              onChange={(v) => setScope(v as Scope)}
              options={scopeOptions}
              ariaLabel={t("modal.scope.label")}
            />
          </FormField>
          <FormField label={t("modal.bodyLabel")}>
            <CodeField value={body} onChange={setBody} filename={`${slugify(name) || "skill"}.md`} />
          </FormField>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={submit} disabled={!name.trim() || !body.trim() || create.isPending}>
            <Icon.Sparkles aria-hidden />
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
