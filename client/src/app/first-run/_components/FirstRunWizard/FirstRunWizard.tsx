/* FirstRunWizard — the app's entry screen while API keys are missing (fresh
   desktop install, empty .env). Three steps: LLM key → GitHub PAT → first
   repo. Opens on the first step not done yet, so keys already set via .env
   are skipped. Full-screen on purpose: the sidebar's screens don't work
   until the keys exist. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import { TitlebarStrip } from "@/components/window-chrome";
import { SETUP_STEPS, useSecretsStatus, useSetupState, type SetupStep } from "@/lib/hooks";
import { LLM_PROVIDERS } from "./constants";
import { s } from "./styles";
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
    <div style={s.page}>
      <TitlebarStrip />
      <div style={s.brand}>
        <div style={s.brandMark}>
          <Icon.Layers size={17} style={{ color: "var(--bg-primary)" }} />
        </div>
        <span style={s.brandName}>DevDigest</span>
      </div>

      <div style={s.card}>
        {isLoading ? (
          <div style={s.loading}>
            <Skeleton height={26} />
            <Skeleton height={22} width={260} />
            <Skeleton height={44} />
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

      <p style={s.footer}>{t("footer", { current: stepIdx + 1, total: SETUP_STEPS.length })}</p>
    </div>
  );
}
