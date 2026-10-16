/* Shim: vendor Tabs → @/components/page-tabs, mapping the old `pad` strings
   to padding classes. Removed with vendor/ui once call sites use PageTabs. */
import React from "react";
import { PageTabs, type TabDef } from "@/components/page-tabs";

const PAD_CLASS: Record<string, string> = { "0": "", "0 24px": "px-6", "0 28px": "px-7" };

export function Tabs({
  tabs,
  value,
  onChange,
  pad = "0 28px",
}: {
  tabs: TabDef[];
  value: string;
  onChange: (k: string) => void;
  pad?: string;
}) {
  return <PageTabs tabs={tabs} value={value} onChange={onChange} className={PAD_CLASS[pad] ?? ""} />;
}
