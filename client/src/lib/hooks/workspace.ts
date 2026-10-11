/* hooks/workspace.ts — current workspace (GET /workspace). Used for
   per-workspace client-side keys (e.g. localStorage). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface WorkspaceInfo {
  workspaceId: string;
  cloneDir: string;
  repos: {
    id: string;
    full_name: string;
    clone_path: string | null;
    last_polled_at: string | null;
    cloned: boolean;
  }[];
}

// TODO: move to @devdigest/shared (no shared contract for GET /workspace yet).
export function useWorkspace() {
  return useQuery({
    queryKey: ["workspace"],
    queryFn: () => api.get<WorkspaceInfo>("/workspace"),
    staleTime: Infinity,
  });
}
