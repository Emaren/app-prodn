import type { Metadata } from "next";
import { redirect } from "next/navigation";

import ForumWarRoom from "@/components/forum/ForumWarRoom";

export const metadata: Metadata = {
  title: "War Room Forum",
  description:
    "The AoE2WAR War Room: Wolo Chronicles, replay analysis, strategy, champions, bounties, and community dispatches.",
};

export default async function ForumPage({
  searchParams,
}: {
  searchParams?: Promise<{ thread?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const legacyThread = Array.isArray(resolvedSearchParams.thread)
    ? resolvedSearchParams.thread[0]
    : resolvedSearchParams.thread;

  if (legacyThread) {
    redirect(`/forum/thread/${encodeURIComponent(legacyThread)}`);
  }

  return <ForumWarRoom />;
}
