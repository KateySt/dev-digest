"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Textarea } from "@devdigest/ui";
import type { EvalCaseKind } from "@devdigest/shared";
import { s } from "../../styles";

/** Raw expected-output JSON editor (the "Advanced" mode): the textarea, the
 *  valid/invalid badge and the skeleton button (a finding skeleton for must
 *  find, a `{file, start_line, end_line}` location skeleton for must not flag). */
export function AdvancedJsonEditor({
  kind,
  value,
  valid,
  onChange,
  onAddSkeleton,
}: {
  kind: EvalCaseKind;
  value: string;
  valid: boolean;
  onChange: (next: string) => void;
  onAddSkeleton: () => void;
}) {
  const t = useTranslations("eval");
  const mustNotFlag = kind === "must_not_flag";
  return (
    <div>
      <div style={s.jsonHeader}>
        <Badge color={valid ? "var(--ok)" : "var(--crit)"}>
          {valid ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}
        </Badge>
        <button type="button" style={s.skeletonBtn} onClick={onAddSkeleton}>
          {mustNotFlag ? t("caseEditor.locationSkeleton") : t("caseEditor.findingSkeleton")}
        </button>
      </div>
      <Textarea value={value} onChange={onChange} rows={12} mono />
    </div>
  );
}
