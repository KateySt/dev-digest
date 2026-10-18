"use client";

import { useTranslations } from "next-intl";
import type { CommandDef } from "./types";

/** Translated label of a registry command ("Go to Skills", "Open command palette"). */
export function useCommandLabel(): (cmd: CommandDef) => string {
  const t = useTranslations("shell");
  return (cmd) =>
    cmd.label.nav
      ? t("shortcuts.goTo", { label: t(`nav.${cmd.label.nav}`) })
      : t(`keyboard.commands.${cmd.label.key}`, cmd.label.values ?? {});
}
