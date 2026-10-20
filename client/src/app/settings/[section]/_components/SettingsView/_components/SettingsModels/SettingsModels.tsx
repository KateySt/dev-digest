"use client";

import { useTranslations } from "next-intl";
import { Combobox } from "@/components/combobox";
import { FormField } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { useSettings, useUpdateSettings } from "@/lib/hooks";
import { useProviderModels } from "@/lib/hooks/agents";
import { toModelOptions } from "@/lib/utils/modelLabel";
import { FEATURE_MODELS } from "@/lib/utils/featureModels";
import type { FeatureModelChoice, FeatureModelId } from "@/lib/types";
import { SectionTitle } from "../SectionTitle";

/**
 * Settings → Feature Models. One picker per system LLM feature; the model list +
 * prices come LIVE from OpenRouter (useProviderModels), and the choice persists
 * to `settings.feature_models`. Each feature falls back to its registry default
 * when unset.
 */
export function SettingsModels() {
  const t = useTranslations("settings");
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const { data: models } = useProviderModels("openrouter");

  const chosen = (settings?.feature_models ?? {}) as Partial<Record<FeatureModelId, FeatureModelChoice>>;
  const baseOptions = toModelOptions(models);
  const noModels = models !== undefined && models.length === 0;

  const setModel = (id: FeatureModelId, model: string) =>
    update.mutate({
      feature_models: { ...chosen, [id]: { provider: "openrouter", model } },
    });

  return (
    <div className="max-w-[640px]">
      <SectionTitle title={t("models.title")} body={t("models.body")} />

      {FEATURE_MODELS.map((f) => {
        const current = chosen[f.id]?.model ?? f.defaultModel;
        const isDefault = !chosen[f.id];
        // Ensure the current value is selectable even if it isn't in the live
        // OpenRouter list (e.g. an OpenAI registry default, or an empty list).
        const options = baseOptions.some((o) => (typeof o === "string" ? o : o.value) === current)
          ? baseOptions
          : [current, ...baseOptions];
        return (
          <div key={f.id} className="mb-4.5">
            <FormField
              label={
                <>
                  {f.label}
                  {isDefault && <span className="ml-2 text-xs font-medium text-subtle-foreground">{t("models.usingDefault")}</span>}
                </>
              }
              hint={f.description}
            >
              <Combobox
                value={current}
                onChange={(m) => setModel(f.id, m)}
                options={options}
                placeholder={t("models.search")}
                ariaLabel={f.label}
              />
            </FormField>
          </div>
        );
      })}

      <div className="mt-2 flex gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-normal text-subtle-foreground">
        <Icon.Info size={15} className="mt-px shrink-0" aria-hidden />
        <span>{noModels ? t("models.noKeyNote") : t("models.liveNote")}</span>
      </div>
    </div>
  );
}
