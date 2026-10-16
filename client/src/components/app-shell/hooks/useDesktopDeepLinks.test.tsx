/* useDesktopDeepLinks — a devdigest://pr link opens the PR when its repo is added, else explains. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, cleanup, waitFor } from "@testing-library/react";
import { get, mockFetch, renderApp } from "@/test/eval-utils";
import { installFakeBridge, removeFakeBridge } from "@/test/fake-desktop-bridge";
import { notify } from "@/lib/contexts";
import { useDesktopDeepLinks } from "./useDesktopDeepLinks";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  removeFakeBridge();
  push.mockReset();
  vi.restoreAllMocks();
});

function Probe() {
  useDesktopDeepLinks();
  return null;
}

const repo = { id: "r1", owner: "Acme", name: "api", full_name: "Acme/api" };

function setup() {
  const fake = installFakeBridge();
  mockFetch([get("/repos", () => [repo])]);
  const { queryClient } = renderApp(<Probe />);
  return { ...fake, queryClient };
}

describe("useDesktopDeepLinks", () => {
  it("opens the PR page of an added repo (owner/name match is case-insensitive)", async () => {
    const { emitOpenPr } = setup();
    act(() => emitOpenPr({ owner: "acme", repo: "API", number: 42 }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/repos/r1/pulls/42"));
  });

  it("waits for the repo list when the link arrives first", async () => {
    const { emitOpenPr, queryClient } = setup();
    act(() => emitOpenPr({ owner: "Acme", repo: "api", number: 7 }));
    expect(queryClient.getQueryState(["repos"])?.status).toBe("pending");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/repos/r1/pulls/7"));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("explains instead of navigating when the repo isn't added", async () => {
    const info = vi.spyOn(notify, "info");
    const { emitOpenPr, queryClient } = setup();
    await waitFor(() => expect(queryClient.getQueryState(["repos"])?.status).toBe("success"));
    act(() => emitOpenPr({ owner: "other", repo: "thing", number: 1 }));
    await waitFor(() => expect(info).toHaveBeenCalledWith(expect.stringContaining("other/thing")));
    expect(push).not.toHaveBeenCalled();
  });
});
