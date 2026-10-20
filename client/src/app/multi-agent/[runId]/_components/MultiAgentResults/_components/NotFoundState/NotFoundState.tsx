/* NotFoundState — 404 for an unknown / other-workspace multi-run (C-AC-26). */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";

export function NotFoundState({ onBack }: { onBack: () => void }) {
  const t = useTranslations("runs.multiAgent.results.notFound");
  return <EmptyState icon="Search" title={t("title")} body={t("body")} cta={t("cta")} onCta={onBack} />;
}
