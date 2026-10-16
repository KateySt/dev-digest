"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Provider } from "@devdigest/shared";
import { Combobox } from "@/components/combobox";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAgent, useProviderModels } from "@/lib/hooks/agents";
import { toModelOptions } from "@/lib/utils";
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_OPTIONS } from "./constants";

/** Create-agent modal — name/description/provider/model/system-prompt. */
export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const create = useCreateAgent();
  const ids = { name: React.useId(), description: React.useId(), prompt: React.useId() };
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>(DEFAULT_PROVIDER);
  const [model, setModel] = React.useState(DEFAULT_MODEL);
  const [systemPrompt, setSystemPrompt] = React.useState(t("create.defaultSystemPrompt"));

  const { data: models } = useProviderModels(provider);
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === model);
  if (!hasModel) modelOptions.unshift(model);
  // Empty list after load = provider key missing/invalid (listModels failed).
  const noModels = models !== undefined && models.length === 0;

  const submit = async () => {
    const agent = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      provider,
      model,
      system_prompt: systemPrompt,
    });
    onClose();
    router.push(`/agents?agent=${agent.id}&tab=config`);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
          <DialogDescription>{t("create.subtitle")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="p-6">
          <FormField label={t("create.fields.name")} required htmlFor={ids.name}>
            <Input
              id={ids.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("create.fields.namePlaceholder")}
            />
          </FormField>
          <FormField label={t("create.fields.description")} htmlFor={ids.description}>
            <Input
              id={ids.description}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("create.fields.descriptionPlaceholder")}
            />
          </FormField>
          <FormField label={t("create.fields.provider")}>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger className="mono w-full" aria-label={t("create.fields.provider")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p} className="mono">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            label={t("create.fields.model")}
            hint={noModels ? t("create.fields.modelEmptyHint", { provider }) : t("create.fields.modelHint")}
          >
            <Combobox
              value={model}
              onChange={setModel}
              options={modelOptions}
              placeholder={t("create.fields.modelSearch")}
              ariaLabel={t("create.fields.model")}
            />
          </FormField>
          <FormField label={t("create.fields.systemPrompt")} htmlFor={ids.prompt}>
            <Textarea
              id={ids.prompt}
              className="mono"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
            />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            <Icon.Plus aria-hidden />
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
