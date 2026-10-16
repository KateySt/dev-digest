/* PromptBlock — one labelled, collapsible prompt segment with copy + fullscreen
   actions; fullscreen opens PromptModalBody in a Modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PromptModalBody } from "../PromptModalBody";

const MINI_BTN =
  "inline-flex cursor-pointer items-center justify-center rounded-[5px] border border-border bg-elevated p-1 text-subtle-foreground hover:text-foreground";

/** `dotClass` colours the leg marker (see PROMPT_DOT). */
export function PromptBlock({ label, text, dotClass }: { label: string; text: string; dotClass: string }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border">
      <div onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2.5 px-3 py-2">
        <span aria-hidden className={cn("size-[7px] rounded-[2px]", dotClass)} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            title={t("trace.prompt.copy")}
            aria-label={t("trace.prompt.copy")}
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
            className={MINI_BTN}
          >
            {copied ? <Icon.Check size={12} aria-hidden /> : <Icon.Copy size={12} aria-hidden />}
          </button>
          <button
            type="button"
            title={t("trace.prompt.fullscreen")}
            aria-label={t("trace.prompt.fullscreen")}
            onClick={(e) => {
              e.stopPropagation();
              setFull(true);
            }}
            className={MINI_BTN}
          >
            <Icon.ExternalLink size={12} aria-hidden />
          </button>
          <span className="text-xs text-subtle-foreground">
            {open ? t("trace.collapse") : t("trace.expand")}
          </span>
        </span>
      </div>
      {open && (
        <pre className="mono m-0 max-h-45 overflow-auto border-t border-border bg-code-bg px-3.5 py-3 text-xs leading-[1.55] whitespace-pre-wrap text-foreground">
          {text || "—"}
        </pre>
      )}
      {full && (
        <Dialog open onOpenChange={(o) => !o && setFull(false)}>
          <DialogContent className="sm:max-w-[1200px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
            </DialogHeader>
            <PromptModalBody text={text} />
            <DialogFooter>
              <Button variant="secondary" size="sm" onClick={copy}>
                {copied ? <Icon.Check aria-hidden /> : <Icon.Copy aria-hidden />}
                {copied ? t("drawer.copied") : t("trace.prompt.copy")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
