/* CancelAllDialog — confirmation before cancelling every queued/running agent (C-AC-51). */
"use client";

import { useTranslations } from "next-intl";
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

export interface CancelAllDialogProps {
  pending?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function CancelAllDialog({ pending, onConfirm, onDismiss }: CancelAllDialogProps) {
  const t = useTranslations("runs.multiAgent.results.cancelAllConfirm");
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="mt-0 px-6 py-4 text-[13.5px] leading-normal">{t("body")}</DialogDescription>
        </DialogBody>
        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={onDismiss}>
            {t("dismiss")}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
