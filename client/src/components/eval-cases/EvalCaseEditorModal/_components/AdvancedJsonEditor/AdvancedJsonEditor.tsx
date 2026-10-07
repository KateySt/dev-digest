"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalCaseKind } from "@devdigest/shared";
import { s } from "../../styles";

/** Raw expected-output JSON editor (the "Advanced" mode): the textarea, the
 *  valid/invalid badge and the skeleton button (a finding skeleton for must
 *  find, a `{file, start_line, end_line}` location skeleton for must not flag). */
export function AdvancedJsonEditor({
  kind,
  value,
  valid,
  hintId,
  onChange,
  onAddSkeleton,
}: {
  kind: EvalCaseKind;
  value: string;
  valid: boolean;
  /** id of the visible hint explaining why Save/Run is blocked (AC-52/53). */
  hintId?: string;
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
      {/* Native textarea (not the vendored Textarea) so it can carry aria-describedby. */}
      <textarea
        className="mono"
        value={value}
        rows={12}
        aria-describedby={hintId}
        aria-invalid={hintId ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        style={s.jsonTextarea}
      />
    </div>
  );
}
