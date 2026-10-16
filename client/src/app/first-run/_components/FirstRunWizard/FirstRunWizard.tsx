/* FirstRunWizard — the app's entry screen while API keys are missing (fresh
   desktop install, empty .env). Three steps: LLM key → GitHub PAT → first
   repo. Opens on the first step not done yet, so keys already set via .env
   are skipped. Full-screen on purpose: the sidebar's screens don't work
   until the keys exist. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { TitlebarStrip } from "@/components/window-chrome";
import { SETUP_STEPS, useSecretsStatus, useSetupState, type SetupStep } from "@/lib/hooks";
import { LLM_PROVIDERS } from "./constants";
import { Stepper } from "./_components/Stepper";
import { KeyStep } from "./_components/KeyStep";
import { RepoStep } from "./_components/RepoStep";

export function FirstRunWizard() {
  const t = useTranslations("firstRun");
  const router = useRouter();
  const { isLoading, state } = useSetupState();
  const { data: status } = useSecretsStatus();
  const [chosen, setChosen] = React.useState<SetupStep | null>(null);
  const step = chosen ?? state?.firstStep ?? "llm";
  const stepIdx = SETUP_STEPS.indexOf(step);

  // Decided once, on arrival: pin the opening step (verifying a key refreshes
  // secrets-status, which must not auto-advance the wizard), and if nothing is
  // left to set up (e.g. opened from the nav) go home.
  const arrivalChecked = React.useRef(false);
  React.useEffect(() => {
    if (isLoading || arrivalChecked.current) return;
    arrivalChecked.current = true;
    if (state && !state.needsSetup && state.hasRepo) router.replace("/");
    else setChosen((c) => c ?? state?.firstStep ?? "llm");
  }, [isLoading, state, router]);

  const go = (offset: 1 | -1) => setChosen(SETUP_STEPS[stepIdx + offset]!);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-7 py-11">
      <TitlebarStrip />
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-7.5 place-items-center rounded-lg bg-foreground">
          <Icon.Layers size={17} className="text-background" aria-hidden />
        </div>
        <span className="text-2xl font-bold tracking-[-0.02em]">{t("brand")}</span>
      </div>

      <div className="w-[520px] max-w-full rounded-[14px] border border-border bg-elevated p-8 shadow-modal">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-6.5 w-full" />
            <Skeleton className="h-5.5 w-65" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : (
          <>
            <Stepper current={step} />
            {step === "llm" && (
              <KeyStep
                key="llm"
                providers={LLM_PROVIDERS}
                status={status}
                title={t("llm.title")}
                body={t("llm.body")}
                label={t("apiKey")}
                onContinue={() => go(1)}
              />
            )}
            {step === "github" && (
              <KeyStep
                key="github"
                providers={["github"]}
                status={status}
                title={t("github.title")}
                body={t("github.body")}
                label={t("github.label")}
                hint={t("github.scopes")}
                onBack={() => go(-1)}
                onContinue={() => go(1)}
              />
            )}
            {step === "repo" && <RepoStep onBack={() => go(-1)} />}
          </>
        )}
      </div>

      <p className="mt-6 text-sm text-subtle-foreground">{t("footer", { current: stepIdx + 1, total: SETUP_STEPS.length })}</p>
    </div>
  );
}
