"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent, CiExport, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useActiveRepo } from "@/lib/contexts";
import { useCiPreview, useDownloadCiZip, useExportCi } from "@/lib/hooks/ci";
import {
  type InstallMethod,
  type WizardState,
  errorMessage,
  initialState,
  isEdited,
  isRepo,
  saveBlob,
  toInput,
  violationsFromError,
  wizardReducer,
} from "./helpers";
import { WizardStepper } from "./_components/WizardStepper";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";
import { s } from "./styles";

export interface ExportWizardProps {
  agent: Agent;
  /** Pre-fill for "Update CI config" (repo, triggers, post_as). */
  initial?: { repo?: string; triggers?: CiTrigger[]; post_as?: CiPostAs };
  onClose: () => void;
}

/** Export to CI - 4 steps (Target, Preview, Configure, Install). Closing before
 *  Install unmounts the wizard, discarding its state; no export request is made
 *  until the Install step's confirm button. */
export function ExportWizard({ agent, initial, onClose }: ExportWizardProps) {
  const t = useTranslations("ci");
  const { activeRepo } = useActiveRepo();
  // "Update CI config" keeps the installation's repo; a fresh export targets the
  // repo currently open in the sidebar.
  const repo = (initial?.repo ?? activeRepo?.full_name ?? "").trim();
  const [state, dispatch] = React.useReducer(wizardReducer, initial, initialState);
  const [method, setMethod] = React.useState<InstallMethod>("pr");
  const [result, setResult] = React.useState<CiExport | null>(null);
  const [installError, setInstallError] = React.useState<string | null>(null);
  const [zipDone, setZipDone] = React.useState(false);

  const previewReq = useCiPreview();
  const exportReq = useExportCi();
  const zipReq = useDownloadCiZip();

  /** Ask the server for a preview of `next`; on success optionally advance. */
  const runPreview = (next: WizardState, opts: { withEdits: boolean; nextStep?: number }) => {
    previewReq.mutate(
      { agentId: agent.id, input: toInput(repo, next, { withEdits: opts.withEdits }) },
      {
        onSuccess: (preview) =>
          dispatch({
            type: "previewLoaded",
            preview,
            fromEdits: opts.withEdits,
            ...(opts.nextStep !== undefined ? { step: opts.nextStep } : {}),
          }),
        onError: (err) =>
          dispatch({ type: "previewFailed", error: errorMessage(err), violations: violationsFromError(err) }),
      },
    );
  };

  const previewing = previewReq.isPending;
  const installing = exportReq.isPending || zipReq.isPending;
  const fileCount = state.preview?.files.length ?? 0;

  const next = () => {
    if (state.step === 0) {
      // Entering Preview: one server preview call; failures stay on Target.
      runPreview(state, { withEdits: false, nextStep: 1 });
    } else if (state.step === 1) {
      // Lint runs on the server, only when the workflow was edited (client A2).
      if (isEdited(state)) runPreview(state, { withEdits: true, nextStep: 2 });
      else dispatch({ type: "setStep", step: 2 });
    } else {
      dispatch({ type: "setStep", step: state.step + 1 });
    }
  };

  const onTriggers = (triggers: CiTrigger[]) => {
    dispatch({ type: "setTriggers", triggers });
    // Install's file list must match the chosen triggers; a manual workflow edit cannot survive.
    if (triggers.length > 0) runPreview({ ...state, triggers, workflowDraft: null }, { withEdits: false });
  };

  const onPostAs = (postAs: CiPostAs) => {
    dispatch({ type: "setPostAs", postAs });
    runPreview({ ...state, postAs }, { withEdits: isEdited(state) });
  };

  const install = () => {
    setInstallError(null);
    setZipDone(false);
    const input = toInput(repo, state, { withEdits: true });
    if (method === "zip") {
      zipReq.mutate(
        { agentId: agent.id, input },
        {
          onSuccess: ({ blob, filename }) => {
            saveBlob(blob, filename ?? "devdigest-ci.zip");
            setZipDone(true);
          },
        },
      );
      return;
    }
    exportReq.mutate(
      { agentId: agent.id, input },
      {
        onSuccess: (res) => setResult(res),
        onError: (err) =>
          setInstallError(
            err instanceof ApiError && err.code === "pat_workflow_scope" && !err.message
              ? t("exportWizard.installStep.patWorkflowScope")
              : err instanceof ApiError && err.code === "github_repo_not_found"
                ? t("exportWizard.installStep.repoNotFound")
                : err instanceof ApiError && err.code === "github_forbidden"
                  ? t("exportWizard.installStep.githubForbidden")
                  : errorMessage(err),
          ),
      },
    );
  };

  const done = result !== null;
  const canContinue =
    !previewing &&
    (state.step === 0 ? isRepo(repo) : state.step === 2 ? state.triggers.length > 0 : true);

  return (
    <Modal width={780} onClose={onClose}>
      <Modal.Header
        title={t("exportWizard.title")}
        subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
        onClose={onClose}
      />
      <div style={s.stepper}>
        <WizardStepper step={done ? 4 : state.step} />
      </div>

      <div style={s.body}>
        {state.step === 0 && <TargetStep hasRepo={isRepo(repo)} error={state.error} />}
        {state.step === 1 && state.preview && (
          <PreviewStep
            preview={state.preview}
            workflowDraft={state.workflowDraft}
            onEditWorkflow={(text) => dispatch({ type: "editWorkflow", text })}
            violations={state.violations}
          />
        )}
        {state.step === 1 && state.error && state.violations.length === 0 && (
          <div style={s.error}>{t("exportWizard.previewError", { message: state.error })}</div>
        )}
        {state.step === 2 && (
          <ConfigureStep
            triggers={state.triggers}
            onTriggers={onTriggers}
            postAs={state.postAs}
            onPostAs={onPostAs}
            failOn={agent.ci_fail_on}
            editsDiscarded={state.editsDiscarded}
            error={state.error}
          />
        )}
        {state.step === 3 && (
          <InstallStep
            repo={repo}
            fileCount={fileCount}
            method={method}
            onMethod={setMethod}
            prUrl={result ? (result.pr_url ?? result.installation.pr_url ?? "") : null}
            zipDone={zipDone}
            error={installError}
          />
        )}
      </div>

      <Modal.Footer>
        <div style={s.footer}>
          {done ? (
            <>
              <div style={s.spacer} />
              <Button kind="primary" onClick={onClose}>
                {t("exportWizard.close")}
              </Button>
            </>
          ) : (
            <>
              {state.step > 0 ? (
                <Button
                  kind="ghost"
                  icon="ChevronLeft"
                  disabled={installing}
                  onClick={() => dispatch({ type: "setStep", step: state.step - 1 })}
                >
                  {t("exportWizard.back")}
                </Button>
              ) : null}
              <div style={s.spacer} />
              {state.step < 3 ? (
                <Button kind="primary" iconRight="ArrowRight" disabled={!canContinue} loading={previewing} onClick={next}>
                  {t("exportWizard.continue")}
                </Button>
              ) : (
                <Button kind="primary" icon="Check" disabled={installing} onClick={install}>
                  {installing ? t("exportWizard.installing") : t("exportWizard.install")}
                </Button>
              )}
            </>
          )}
        </div>
      </Modal.Footer>
    </Modal>
  );
}
