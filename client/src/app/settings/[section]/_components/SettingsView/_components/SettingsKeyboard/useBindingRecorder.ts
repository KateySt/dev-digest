"use client";

import React from "react";
import { chordFromEvent, isModified, type Binding, type Platform } from "@/components/keyboard";

/** Window for the second key of a recorded sequence ("g then p") — SPEC-11 AC-27. */
export const SEQUENCE_WINDOW_MS = 1000;

export type RecorderResult = { kind: "binding"; binding: Binding } | { kind: "disable" } | { kind: "cancel" };

/**
 * Turns keydowns on a focused element into a binding. Esc cancels,
 * Backspace (no modifiers) disables, anything else becomes a chord; with
 * `allowSequence`, a plain key followed within 1 s by another plain key is
 * recorded as a two-key sequence.
 */
export function useBindingRecorder({
  platform,
  allowSequence,
  onDone,
}: {
  platform: Platform;
  allowSequence: boolean;
  onDone: (r: RecorderResult) => void;
}) {
  const [first, setFirst] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  React.useEffect(() => () => clearTimeout(timer.current), []);

  const finish = (r: RecorderResult) => {
    clearTimeout(timer.current);
    setFirst(null);
    doneRef.current(r);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (e.key === "Escape" && plain) return finish({ kind: "cancel" });
    if (e.key === "Backspace" && plain && !first) return finish({ kind: "disable" });
    const chord = chordFromEvent(e.nativeEvent, platform);
    if (!chord) return; // a bare modifier — wait for the key

    if (first) return finish({ kind: "binding", binding: isModified(chord) ? chord : `${first} ${chord}` });
    if (allowSequence && !isModified(chord)) {
      setFirst(chord);
      timer.current = setTimeout(() => finish({ kind: "binding", binding: chord }), SEQUENCE_WINDOW_MS);
      return;
    }
    finish({ kind: "binding", binding: chord });
  };

  return { first, onKeyDown };
}
