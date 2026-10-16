import type { IconName } from "@/components/icon";
import type { Verdict } from "@devdigest/shared";

/** Per-verdict visual meta (text/background classes). `labelKey` resolves under the `verdict` namespace. */
export const VERDICT_META: Record<Verdict, { text: string; bg: string; icon: IconName; labelKey: string }> = {
  request_changes: { text: "text-crit", bg: "bg-crit-bg", icon: "XCircle", labelKey: "requestChanges" },
  approve: { text: "text-ok", bg: "bg-ok-bg", icon: "CheckCircle", labelKey: "approve" },
  comment: { text: "text-info", bg: "bg-info-bg", icon: "MessageSquare", labelKey: "comment" },
};
