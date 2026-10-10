/* CancelAllDialog — confirmation before cancelling every queued/running agent (C-AC-51). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export interface CancelAllDialogProps {
  pending?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function CancelAllDialog({ pending, onConfirm, onDismiss }: CancelAllDialogProps) {
  const t = useTranslations("runs.multiAgent.results.cancelAllConfirm");
  return (
    <Modal width={440} onClose={onDismiss}>
      <Modal.Header title={t("title")} onClose={onDismiss} />
      <div style={{ padding: "16px 24px", fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {t("body")}
      </div>
      <Modal.Footer>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="secondary" onClick={onDismiss}>
            {t("dismiss")}
          </Button>
          <Button kind="danger" disabled={pending} onClick={onConfirm}>
            {t("confirm")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
