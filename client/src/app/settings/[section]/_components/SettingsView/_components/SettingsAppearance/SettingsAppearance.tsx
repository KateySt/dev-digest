/* Settings → Appearance: mode, surface palette and accent. Purely client-side —
   applied as attributes on <html> and saved in localStorage by ThemeProvider. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { THEME_ACCENTS, THEME_PALETTES, THEME_PREFS, useTheme } from "@/lib/contexts";
import { cn } from "@/lib/utils";
import { SectionTitle } from "../SectionTitle";
import { ACCENT_SWATCH, MODE_SWATCH, PALETTE_SWATCH } from "./constants";

function ChoiceGroup<T extends string>({
  label,
  hint,
  options,
  value,
  optionLabel,
  swatch,
  onChange,
}: {
  label: string;
  hint: string;
  options: readonly T[];
  value: T;
  optionLabel: (option: T) => string;
  swatch: Record<T, string>;
  onChange: (option: T) => void;
}) {
  const labelId = React.useId();
  return (
    <div className="border-b border-border py-3.5">
      <div id={labelId} className="text-base font-semibold text-foreground">
        {label}
      </div>
      <div className="mt-0.75 mb-3 text-sm leading-[1.45] text-muted-foreground">{hint}</div>
      <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(option)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                on
                  ? "border-primary bg-brand-bg font-semibold text-foreground"
                  : "border-border bg-elevated text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span aria-hidden className={cn("size-3.5 rounded-full border border-border-strong", swatch[option])} />
              {optionLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsAppearance() {
  const t = useTranslations("settings.appearance");
  const { themePref, palette, accent, set, setPalette, setAccent } = useTheme();

  return (
    <div className="max-w-[640px]">
      <SectionTitle title={t("title")} body={t("body")} />
      <ChoiceGroup
        label={t("modeLabel")}
        hint={t("modeHint")}
        options={THEME_PREFS}
        value={themePref}
        optionLabel={(m) => t(`modes.${m}`)}
        swatch={MODE_SWATCH}
        onChange={set}
      />
      <ChoiceGroup
        label={t("paletteLabel")}
        hint={t("paletteHint")}
        options={THEME_PALETTES}
        value={palette}
        optionLabel={(p) => t(`palettes.${p}`)}
        swatch={PALETTE_SWATCH}
        onChange={setPalette}
      />
      <ChoiceGroup
        label={t("accentLabel")}
        hint={t("accentHint")}
        options={THEME_ACCENTS}
        value={accent}
        optionLabel={(a) => t(`accents.${a}`)}
        swatch={ACCENT_SWATCH}
        onChange={setAccent}
      />
    </div>
  );
}
