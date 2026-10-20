/* sidebarState — whether the sidebar is expanded, shared across page
   navigations (each page mounts its own AppShell, so React state alone would
   reset on every route change).

   Rule (plan 2026-10-19, M6): below SIDEBAR_COLLAPSE_BELOW px of window width
   the sidebar collapses to its icon rail; above it, it expands. A manual
   toggle (Ctrl/⌘+B, the rail button) wins until the window crosses the
   breakpoint again — then the width rule takes over. */
"use client";

import React from "react";

export const SIDEBAR_COLLAPSE_BELOW = 1200;

let manual: boolean | null = null;
let narrow: boolean | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function query(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  return window.matchMedia(`(max-width: ${SIDEBAR_COLLAPSE_BELOW - 1}px)`);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const mql = query();
  const onChange = () => {
    if (!mql || mql.matches === narrow) return;
    narrow = mql.matches;
    manual = null; // crossing the breakpoint hands control back to the width rule
    emit();
  };
  mql?.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    mql?.removeEventListener("change", onChange);
  };
}

function getOpen(): boolean {
  if (narrow === null) narrow = query()?.matches ?? false;
  return manual ?? !narrow;
}

/** [open, setOpen] for SidebarProvider's controlled `open` / `onOpenChange`. */
export function useSidebarOpen(): [boolean, (open: boolean) => void] {
  const open = React.useSyncExternalStore(subscribe, getOpen, () => true);
  const setOpen = React.useCallback((next: boolean) => {
    manual = next;
    emit();
  }, []);
  return [open, setOpen];
}
