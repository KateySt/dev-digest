/* useDialogKeyboard - keyboard/focus management for the confirm dialog (spec
   a11y NFR: the dialog traps focus and is dismissable by keyboard). The vendored
   Modal does none of this. On mount: remember the opener, move focus inside.
   While open: Tab / Shift+Tab cycle within the dialog, Escape closes. On
   unmount: focus returns to the opener. `onClose` lives in a ref so an inline
   arrow from the parent does not re-subscribe the listener every render. */
"use client";

import React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Attach the returned ref to any element rendered inside the Modal's dialog. */
export function useDialogKeyboard(onClose: () => void) {
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getDialog = () => anchorRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    const getFocusable = () => {
      const dialog = getDialog();
      return dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    };

    getFocusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const dialog = getDialog();
      const items = getFocusable();
      if (!dialog || items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (!active || !dialog.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return anchorRef;
}
