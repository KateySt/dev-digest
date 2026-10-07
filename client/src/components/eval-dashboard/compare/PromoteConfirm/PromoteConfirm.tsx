"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

/** Inline "Promote vN?" confirmation shown in the compare modal's footer. All
 *  copy is passed in (so agent and skill promote can word it differently); an
 *  `error` slot shows the owner-specific failure (e.g. missing skills), and
 *  `blocked` disables the confirm button when retrying can't help. */
export function PromoteConfirm({
  title,
  body,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  pending,
  blocked = false,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  pending: boolean;
  blocked?: boolean;
  error?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="alertdialog" aria-label={title} style={s.confirm}>
      <strong>{title}</strong>
      <p style={{ margin: "6px 0 10px" }}>{body}</p>
      {error && (
        <p role="alert" style={s.error}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button kind="primary" size="sm" onClick={onConfirm} loading={pending} disabled={blocked}>
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button kind="ghost" size="sm" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
