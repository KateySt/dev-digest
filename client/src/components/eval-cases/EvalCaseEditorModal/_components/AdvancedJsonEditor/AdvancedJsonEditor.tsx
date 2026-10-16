"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { EvalCaseKind } from "@devdigest/shared";

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
      <div className="mb-2 flex items-center gap-2.5">
        <Badge variant={valid ? "ok" : "crit"}>{valid ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}</Badge>
        <button
          type="button"
          className="ml-auto cursor-pointer border-none bg-transparent p-0 text-xs text-primary"
          onClick={onAddSkeleton}
        >
          {mustNotFlag ? t("caseEditor.locationSkeleton") : t("caseEditor.findingSkeleton")}
        </button>
      </div>
      <Textarea
        className="mono field-sizing-fixed resize-y leading-[1.55]"
        value={value}
        rows={12}
        aria-describedby={hintId}
        aria-invalid={hintId ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
