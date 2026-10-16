/* toast.tsx — A6 cross-cutting: system-level notifications.
   Error UX taxonomy: system errors → toast (here); form errors → inline;
   critical → full-screen (ErrorState fullScreen). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastCtx = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* Module-level bridge so non-React code (e.g. the React Query cache) can raise
   toasts without the hook. The mounted <ToastProvider> registers its pusher. */
type Pusher = (message: string, kind?: ToastKind) => void;
let activePusher: Pusher | null = null;
export const notify = {
  toast: (m: string, k?: ToastKind) => activePusher?.(m, k),
  success: (m: string) => activePusher?.(m, "success"),
  error: (m: string) => activePusher?.(m, "error"),
  info: (m: string) => activePusher?.(m, "info"),
};

/** Card tint, border and glyph colour per toast kind. */
const KIND: Record<ToastKind, { card: string; glyph: string; icon: string }> = {
  success: { card: "border-ok bg-ok-bg", glyph: "text-ok", icon: "✓" },
  error: { card: "border-crit bg-crit-bg", glyph: "text-crit", icon: "✕" },
  info: { card: "border-border-strong bg-elevated", glyph: "text-border-strong", icon: "ℹ" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const t = useTranslations("common.toast");
  const k = KIND[toast.kind];
  return (
    <div
      className={cn(
        "flex animate-dd-toast-in items-center gap-3 rounded-[9px] border px-4 py-3 text-base text-foreground shadow-[0_6px_24px_rgba(0,0,0,0.3)]",
        k.card,
      )}
    >
      <span className={cn("font-bold", k.glyph)}>{k.icon}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="cursor-pointer border-none bg-transparent text-lg text-subtle-foreground"
        aria-label={t("dismiss")}
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const seq = React.useRef(1);

  const push = React.useCallback((message: string, kind: ToastKind = "info") => {
    const id = seq.current++;
    setItems((prev) => [...prev, { id, kind, message }]);
    // auto-dismiss after 4s
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
    }),
    [push],
  );

  // Expose this provider's pusher to the module-level `notify` bridge.
  React.useEffect(() => {
    activePusher = push;
    return () => {
      if (activePusher === push) activePusher = null;
    };
  }, [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="fixed right-5 bottom-5 z-1000 flex max-w-95 flex-col gap-2.5" role="status"
        aria-live="polite"
      >
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => setItems((prev) => prev.filter((x) => x.id !== t.id))} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
