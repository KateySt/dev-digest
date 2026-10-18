"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { CommandDef } from "./types";

/** Translated label of a registry command ("Go to Skills", "Open command palette").
 *  Stable across renders — callers use it in effect dependencies. */
export function useCommandLabel(): (cmd: CommandDef) => string {
  const t = useTranslations("shell");
  return React.useCallback(
    (cmd: CommandDef) => {
      const nav = cmd.label.nav ? t(`nav.${cmd.label.nav}`) : undefined;
      if (cmd.label.key === "goTo") return t("shortcuts.goTo", { label: nav ?? "" });
      return t(`keyboard.commands.${cmd.label.key}`, { ...(cmd.label.values ?? {}), ...(nav ? { label: nav } : {}) });
    },
    [t],
  );
}
