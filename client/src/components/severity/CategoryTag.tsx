"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { CATEGORY_ICON, type Category } from "./tokens";

export function CategoryTag({ category }: { category: Category }) {
  const t = useTranslations("common.category");
  const icon = CATEGORY_ICON[category];
  if (!icon) return null;
  const I = Icon[icon];
  return (
    <span className="inline-flex items-center gap-1.25 text-xs font-medium text-subtle-foreground">
      <I size={12} aria-hidden />
      {t(category)}
    </span>
  );
}
