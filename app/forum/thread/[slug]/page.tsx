import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import ForumThreadPageClient from "@/components/forum/ForumThreadPageClient";
import {
  buildForumFallbackSnapshot,
  FORUM_SEED_THREADS,
  loadForumSnapshot,
} from "@/lib/forum";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const normalizedSlug = decodeURIComponent(slug);
  const seed = FORUM_SEED_THREADS.find((thread) => thread.slug === normalizedSlug);

  return {
    title: seed?.title ?? "War Room Dispatch",
    description:
      seed?.excerpt ??
      "A dispatch from the AoE2WAR War Room: replays, strategy, rivalries, and the long memory of the game.",
  };
}

export default async function ForumThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const normalizedSlug = decodeURIComponent(slug);
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  let snapshot;
  try {
    snapshot = await loadForumSnapshot(getPrisma(), claims?.uid ?? null);
  } catch (error) {
    console.warn("Failed to load the shared War Room thread:", error);
    snapshot = buildForumFallbackSnapshot();
  }

  if (!snapshot.threads.some((thread) => thread.slug === normalizedSlug)) {
    notFound();
  }

  return (
    <ForumThreadPageClient
      initialSnapshot={snapshot}
      slug={normalizedSlug}
    />
  );
}
