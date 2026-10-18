/* BindingKeys — renders a binding as kbd chips: "⌘ K", "G then P". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { formatBinding } from "./keys";
import { useKeyboard } from "./KeyboardProvider";
import type { Binding } from "./types";

export function BindingKeys({ binding, off, className }: { binding: Binding; off?: boolean; className?: string }) {
  const t = useTranslations("shell.keyboard");
  const { platform } = useKeyboard();
  const chords = formatBinding(binding, platform);
  return (
    <span className={cn("inline-flex items-center gap-1", off && "opacity-50 line-through", className)}>
      {chords.map((parts, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-xs text-subtle-foreground">{t("then")}</span>}
          {parts.map((p, j) => (
            <Kbd key={j} className="mono border border-border-strong bg-surface">
              {p}
            </Kbd>
          ))}
        </React.Fragment>
      ))}
    </span>
  );
}
