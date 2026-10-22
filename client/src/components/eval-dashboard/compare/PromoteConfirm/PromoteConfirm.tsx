"use client";

import type React from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WRAP } from "../../constants";

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
    <div
      role="alertdialog"
      aria-label={title}
      className={cn("mt-3.5 rounded-lg border border-warn px-3.5 py-3 text-sm text-muted-foreground", WRAP)}
    >
      <strong>{title}</strong>
      <p className="mt-1.5 mb-2.5">{body}</p>
      {error && (
        <p role="alert" className={cn("text-sm text-crit", WRAP)}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={pending || blocked}>
          {pending && <Icon.Loader className="animate-spin" aria-hidden />}
          {pending ? pendingLabel : confirmLabel}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
