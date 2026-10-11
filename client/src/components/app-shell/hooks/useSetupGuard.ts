"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSetupState } from "@/lib/hooks";

/** Routes reachable while keys are missing: the wizard itself and Settings → API Keys. */
const UNGATED = ["/first-run", "/settings"];

/**
 * Sends the user to the first-run wizard while no LLM key or GitHub token is
 * configured (fresh desktop install, empty .env). Never redirects while the
 * status is loading or when it failed (API down) — no redirect loop.
 */
export function useSetupGuard(): void {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { state } = useSetupState();
  const ungated = UNGATED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const needsSetup = state?.needsSetup === true;

  React.useEffect(() => {
    if (needsSetup && !ungated) router.replace("/first-run");
  }, [needsSetup, ungated, router]);
}
