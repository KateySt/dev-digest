/* useSetupGuard — redirects to /first-run only when keys are known to be missing. */
import type React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiError, get, mockFetch } from "@/test/eval-utils";
import { useSetupGuard } from "./useSetupGuard";

const replace = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
  pathname = "/";
});

const none = { openai: false, anthropic: false, openrouter: false, github: false };

function run(statusResponder: () => unknown) {
  const api = mockFetch([get("/settings/secrets-status", statusResponder), get("/repos", () => [])]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  renderHook(() => useSetupGuard(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  /** Resolves once both queries the guard reads have settled. */
  const settled = () =>
    waitFor(() => {
      for (const key of [["secrets-status"], ["repos"]]) expect(qc.getQueryState(key)?.status).not.toBe("pending");
    });
  return { api, settled };
}

describe("useSetupGuard", () => {
  it("sends the user to /first-run when keys are missing", async () => {
    pathname = "/repos/r1/pulls";
    const { settled } = run(() => none);
    await settled();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/first-run"));
  });

  it("leaves Settings reachable while keys are missing", async () => {
    pathname = "/settings/api-keys";
    const { settled } = run(() => none);
    await settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does nothing when the keys are configured", async () => {
    const { settled } = run(() => ({ ...none, openrouter: true, github: true }));
    await settled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not redirect when the status call fails (API down) — no loop", async () => {
    const { settled } = run(() => apiError(500, "boom"));
    await settled();
    expect(replace).not.toHaveBeenCalled();
  });
});
