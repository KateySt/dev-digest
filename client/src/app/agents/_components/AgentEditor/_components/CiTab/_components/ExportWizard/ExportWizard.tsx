"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Agent, CiExport, CiPostAs, CiTrigger } from "@devdigest/shared";
import { JenkinsConnectionDialog } from "@/components/jenkins-connection-dialog";
import { ApiError } from "@/lib/api";
import { useActiveRepo } from "@/lib/contexts";
import { useCiPreview, useDownloadCiZip, useExportCi, useJenkinsConnection } from "@/lib/hooks/ci";
import {
  type InstallMethod,
  type WizardInitial,
  type WizardState,
  errorMessage,
  initialState,
  isCredentialId,
  isEdited,
  isRepo,
  jenkinsFieldErrors,
  saveBlob,
  targetConflictFromError,
  toInput,
  violationsFromError,
  wizardReducer,
} from "./helpers";
import type { ExportTarget, JenkinsFields } from "./constants";
import { WizardStepper } from "./_components/WizardStepper";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";

export interface ExportWizardProps {
  agent: Agent;
  /** Pre-fill for "Update CI config" (repo, target, triggers, post_as, Jenkins settings). */
  initial?: WizardInitial;
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
  const [connectionOpen, setConnectionOpen] = React.useState(false);
  const isJenkins = state.target === "jenkins";
  const connection = useJenkinsConnection(isJenkins ? repo : null);
  const connected = !!connection.data?.has_token;

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
          dispatch({
            type: "previewFailed",
            error: errorMessage(err),
            violations: violationsFromError(err),
            conflict: targetConflictFromError(err, repo),
          }),
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
    const input = toInput(repo, state, { withEdits: true, createJob: method === "pr" && connected });
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
  const jenkinsValid = !isJenkins || Object.keys(jenkinsFieldErrors(state.jenkins)).length === 0;
  const canContinue =
    !previewing &&
    (state.step === 0
      ? isRepo(repo) && !state.conflict
      : state.step === 2
        ? state.triggers.length > 0 && jenkinsValid
        : true);
  // C-AC-43: Install waits for a valid scan credential when the job is to be created.
  const scanBlocks =
    isJenkins && method === "pr" && connected && state.createJob && !isCredentialId(state.scanCredentialId.trim());

  const onTarget = (target: ExportTarget) => dispatch({ type: "setTarget", target });
  const onJenkins = (patch: Partial<JenkinsFields>) => dispatch({ type: "setJenkins", patch });
  const openConnection = () => setConnectionOpen(true);

  return (
    <Dialog open onOpenChange={(open) => !open && !connectionOpen && onClose()}>
      {connectionOpen && <JenkinsConnectionDialog repo={repo} onClose={() => setConnectionOpen(false)} />}
      <DialogContent className="sm:max-w-[780px]">
      <DialogHeader>
        <DialogTitle>{t("exportWizard.title")}</DialogTitle>
        <DialogDescription>{t("exportWizard.subtitle", { agentName: agent.name })}</DialogDescription>
      </DialogHeader>
      <div className="border-b border-border px-6 pt-4 pb-3.5">
        <WizardStepper step={done ? 4 : state.step} />
      </div>

      <DialogBody className="flex min-w-0 flex-col gap-4 p-6">
        {state.step === 0 && (
          <TargetStep
            target={state.target}
            onTarget={onTarget}
            hasRepo={isRepo(repo)}
            error={state.error}
            conflict={state.conflict}
          />
        )}
        {state.step === 1 && state.preview && (
          <PreviewStep
            preview={state.preview}
            workflowDraft={state.workflowDraft}
            onEditWorkflow={(text) => dispatch({ type: "editWorkflow", text })}
            violations={state.violations}
          />
        )}
        {state.step === 1 && state.error && state.violations.length === 0 && (
          <div className="min-w-0 text-sm text-crit wrap-anywhere">
            {t("exportWizard.previewError", { message: state.error })}
          </div>
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
            target={state.target}
            repo={repo}
            jenkins={state.jenkins}
            onJenkins={onJenkins}
            onOpenConnection={openConnection}
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
            target={state.target}
            jenkinsJob={result?.jenkins_job ?? null}
            jenkinsOption={
              isJenkins
                ? {
                    jobName: state.jenkins.job_name,
                    connected,
                    createJob: state.createJob,
                    onCreateJob: (createJob) => dispatch({ type: "setCreateJob", createJob }),
                    scanCredentialId: state.scanCredentialId,
                    onScanCredentialId: (value) => dispatch({ type: "setScanCredentialId", value }),
                    onOpenConnection: openConnection,
                  }
                : null
            }
          />
        )}
      </DialogBody>

      <DialogFooter className="items-center">
          {done ? (
            <>
              <div className="flex-1" />
              <Button onClick={onClose}>
                {t("exportWizard.close")}
              </Button>
            </>
          ) : (
            <>
              {state.step > 0 ? (
                <Button
                  variant="outline"
                  disabled={installing}
                  onClick={() => dispatch({ type: "setStep", step: state.step - 1 })}
                >
                  <Icon.ChevronLeft aria-hidden />
                  {t("exportWizard.back")}
                </Button>
              ) : null}
              <div className="flex-1" />
              {state.step < 3 ? (
                <Button disabled={!canContinue} onClick={next}>
                  {previewing && <Icon.Loader className="animate-spin" aria-hidden />}
                  {t("exportWizard.continue")}
                  <Icon.ArrowRight aria-hidden />
                </Button>
              ) : (
                <Button disabled={installing || scanBlocks} onClick={install}>
                  <Icon.Check aria-hidden />
                  {installing ? t("exportWizard.installing") : t("exportWizard.install")}
                </Button>
              )}
            </>
          )}
      </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
