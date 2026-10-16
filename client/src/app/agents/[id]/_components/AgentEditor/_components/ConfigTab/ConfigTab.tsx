"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CodeField } from "@/components/code-field";
import { Combobox } from "@/components/combobox";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";
import { useUpdateAgent, useProviderModels } from "@/lib/hooks/agents";
import { useToast } from "@/lib/contexts";
import { toModelOptions } from "@/lib/utils";
import { slugify } from "@/lib/slug";
import { CI_FAIL_ON_VALUES, PROVIDER_OPTIONS, STRATEGY_VALUES } from "./constants";

const TOGGLE_LABEL = "ml-auto flex items-center gap-2.5 text-sm text-muted-foreground";

/** Config tab — name/description/provider/model/system-prompt + enabled toggle. */
export function ConfigTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const nameId = React.useId();
  const descriptionId = React.useId();
  const update = useUpdateAgent();
  const [name, setName] = React.useState(agent.name);
  const [description, setDescription] = React.useState(agent.description);
  const [provider, setProvider] = React.useState<Provider>(agent.provider);
  const [model, setModel] = React.useState(agent.model);
  const [systemPrompt, setSystemPrompt] = React.useState(agent.system_prompt);
  const [strategy, setStrategy] = React.useState<ReviewStrategy>(agent.strategy);
  const [ciFailOn, setCiFailOn] = React.useState<CiFailOn>(agent.ci_fail_on);
  const [repoIntel, setRepoIntel] = React.useState(agent.repo_intel);

  // Reset local form when switching agents.
  React.useEffect(() => {
    setName(agent.name);
    setDescription(agent.description);
    setProvider(agent.provider);
    setModel(agent.model);
    setSystemPrompt(agent.system_prompt);
    setStrategy(agent.strategy);
    setCiFailOn(agent.ci_fail_on);
    setRepoIntel(agent.repo_intel);
  }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEnabled = (enabled: boolean) => update.mutate({ id: agent.id, patch: { enabled } });

  const { data: models } = useProviderModels(provider);
  // Show the price (USD per 1M in/out tokens) in the label when the provider
  // exposes it (OpenRouter) so a cheap model is easy to pick; value stays the id.
  const modelOptions = toModelOptions(models);
  const hasModel = modelOptions.some((o) => (typeof o === "string" ? o : o.value) === model);
  if (!hasModel) modelOptions.unshift(model);
  // Empty list after load = provider key missing/invalid (listModels failed) —
  // guide the user instead of showing a silent one-item dropdown.
  const noModels = models !== undefined && models.length === 0;

  // Friendly labels for the strategy select (values come from constants).
  const strategyOptions = STRATEGY_VALUES.map((v) => ({ value: v, label: t(`config.strategyOptions.${v}`) }));
  const ciFailOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: t(`config.ciFailOnOptions.${v}`) }));

  const save = () =>
    update.mutate(
      {
        id: agent.id,
        patch: {
          name,
          description,
          provider,
          model,
          system_prompt: systemPrompt,
          strategy,
          ci_fail_on: ciFailOn,
          repo_intel: repoIntel,
        },
      },
      {
        // Failures are surfaced by the global mutation error toast; confirm the
        // save with a success toast (not just the inline "Saved (vN)" note).
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  return (
    <div className="max-w-[760px]">
      <div className="mb-5 flex items-center">
        <h2 className="text-xl font-bold">{t("config.title")}</h2>
        <label className={TOGGLE_LABEL}>
          {t("config.enabled")}
          <Switch checked={agent.enabled} onCheckedChange={toggleEnabled} />
        </label>
      </div>
      <FormField label={t("config.name")} required htmlFor={nameId}>
        <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t("config.description")} htmlFor={descriptionId}>
        <Input id={descriptionId} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <FormField label={t("config.provider")}>
        <SelectField
          value={provider}
          onChange={(v) => setProvider(v as Provider)}
          options={PROVIDER_OPTIONS}
          ariaLabel={t("config.provider")}
        />
      </FormField>
      <FormField
        label={t("config.model")}
        hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
      >
        <Combobox
          value={model}
          onChange={setModel}
          options={modelOptions}
          placeholder={t("config.modelSearch")}
          ariaLabel={t("config.model")}
        />
      </FormField>
      <FormField label={t("config.strategy")} hint={t("config.strategyHint")}>
        <SelectField
          value={strategy}
          onChange={(v) => setStrategy(v as ReviewStrategy)}
          options={strategyOptions}
          ariaLabel={t("config.strategy")}
        />
      </FormField>
      <FormField label={t("config.ciFailOn")} hint={t("config.ciFailOnHint")}>
        <SelectField
          value={ciFailOn}
          onChange={(v) => setCiFailOn(v as CiFailOn)}
          options={ciFailOnOptions}
          ariaLabel={t("config.ciFailOn")}
        />
      </FormField>
      <FormField label={t("config.repoIntel")} hint={t("config.repoIntelHint")}>
        <label className={TOGGLE_LABEL}>
          <Switch checked={repoIntel} onCheckedChange={setRepoIntel} aria-label={t("config.repoIntel")} />
        </label>
      </FormField>
      <FormField label={t("config.systemPrompt")} hint={t("config.systemPromptHint")}>
        <CodeField
          value={systemPrompt}
          onChange={setSystemPrompt}
          filename={`${slugify(name) || "agent"}-system-prompt.md`}
          dirty={systemPrompt !== agent.system_prompt}
          minHeight={200}
        />
      </FormField>
      <FormField label={t("config.outputSchema")}>
        <SelectField
          value="standard"
          options={[{ value: "standard", label: t("config.outputSchemaStandard") }]}
          ariaLabel={t("config.outputSchema")}
        />
      </FormField>
      <div className="mt-2.5 flex gap-2.5">
        <Button onClick={save} disabled={update.isPending}>
          <Icon.Check aria-hidden />
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && (
          <span className="self-center text-sm text-ok">{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
