"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffGroup, Finding } from "@/lib/types";
import { ROLE_ORDER, ROLE_LABEL_KEYS } from "@/components/diff-viewer/constants";
import { s } from "./styles";

const DESCRIPTION_KEYS: Record<string, string> = {
  core: "coreLabelDescription",
  tests: "testsLabelDescription",
  wiring: "wiringLabelDescription",
  docs: "docsLabelDescription",
  boilerplate: "boilerplateLabelDescription",
};

export function ChangesOverview({
  groups,
  findings,
}: {
  groups?: SmartDiffGroup[];
  findings?: Finding[];
}) {
  const t = useTranslations("prReview.smartDiff");

  if (!groups || groups.length === 0) {
    return null;
  }

  // Compute findings count per role
  const findingsByRole = new Map<string, Set<string>>();
  if (findings) {
    findings.forEach((f) => {
      // Find which group this finding belongs to
      for (const group of groups) {
        if (group.files.some((gf) => gf.path === f.file)) {
          if (!findingsByRole.has(group.role)) {
            findingsByRole.set(group.role, new Set());
          }
          findingsByRole.get(group.role)!.add(f.id);
        }
      }
    });
  }

  const groupsByRole = new Map(groups.map((g) => [g.role, g]));

  return (
    <div style={s.container}>
      <h3 style={s.title}>Changes</h3>
      <div style={s.table}>
        {ROLE_ORDER.map((role) => {
          const group = groupsByRole.get(role);
          if (!group) return null;

          const findingsCount = findingsByRole.get(role)?.size ?? 0;
          const fileCount = group.files.length;

          return (
            <div key={role} style={s.row}>
              <div style={s.roleCell}>
                <span style={s.roleLabel}>{t(ROLE_LABEL_KEYS[role])}</span>
              </div>
              <div style={s.descriptionCell}>
                <span style={s.description}>{t(DESCRIPTION_KEYS[role] ?? "")}</span>
              </div>
              <div style={s.findingsCell}>
                {findingsCount > 0 && (
                  <div style={s.findingsBadge}>
                    <Icon.AlertTriangle size={14} style={{ color: "var(--color-error)" }} />
                    <span style={s.findingsCount}>{findingsCount}</span>
                  </div>
                )}
              </div>
              <div style={s.fileCountCell}>
                <span style={s.fileCount}>{fileCount} files</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
