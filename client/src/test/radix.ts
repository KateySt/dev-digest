/* Test helpers for Radix-based shadcn/ui components. */
import { fireEvent } from "@testing-library/react";

/** Open a Radix DropdownMenu/Select trigger the way a mouse does (pointerdown,
 *  primary button) — a plain click doesn't open them. */
export function openMenu(trigger: Element) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
}
