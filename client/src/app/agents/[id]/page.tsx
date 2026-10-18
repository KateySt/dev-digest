import { redirect } from "next/navigation";

/* /agents/:id — kept so old links, bookmarks and notifications still work:
   the editor now lives in the right pane of /agents (?agent=&tab=). */
export default async function AgentRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const sp = new URLSearchParams({ agent: id, tab: typeof tab === "string" ? tab : "config" });
  redirect(`/agents?${sp.toString()}`);
}
