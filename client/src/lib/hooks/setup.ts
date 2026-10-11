/* hooks/setup.ts — first-run gate. Derives "does this install still need the
   setup wizard?" from the existing secrets-status + repos queries; no new
   endpoint and no cache of its own. */
"use client";

import type { SecretsStatus } from "../types";
import { useRepos, useSecretsStatus } from "./core";

/** Wizard steps, in order. `repo` is optional (the user may skip it). */
export const SETUP_STEPS = ["llm", "github", "repo"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export interface SetupState {
  hasLlm: boolean;
  hasGithub: boolean;
  hasRepo: boolean;
  /** Keys missing → the app sends the user to /first-run. */
  needsSetup: boolean;
  /** Where the wizard opens: the first step not done yet (`repo` when all are). */
  firstStep: SetupStep;
}

/** Pure derivation, unit-tested. Any one LLM provider key is enough. */
export function computeSetupState(status: SecretsStatus, repoCount: number): SetupState {
  const hasLlm = status.openai || status.anthropic || status.openrouter;
  const hasGithub = status.github;
  const hasRepo = repoCount > 0;
  const firstStep: SetupStep = !hasLlm ? "llm" : !hasGithub ? "github" : "repo";
  return { hasLlm, hasGithub, hasRepo, needsSetup: !hasLlm || !hasGithub, firstStep };
}

/**
 * Setup state for the gate and the wizard. `state` is null while loading AND
 * when secrets-status failed (API down) — callers must not redirect on null,
 * otherwise an unreachable API would loop the user through /first-run.
 */
export function useSetupState(): { isLoading: boolean; state: SetupState | null } {
  const { data: status, isLoading: statusLoading } = useSecretsStatus();
  const { data: repos, isLoading: reposLoading } = useRepos();
  const isLoading = statusLoading || reposLoading;
  const state = status ? computeSetupState(status, repos?.length ?? 0) : null;
  return { isLoading, state };
}
