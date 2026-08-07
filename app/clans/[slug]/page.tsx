import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import ClanHallClient from "@/components/clans/ClanHallClient";
import {
  buildClanFallbackSnapshot,
  findFoundingClanFallback,
  loadClanHallSnapshot,
  normalizeClanView,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const normalizedSlug = decodeURIComponent(slug)
    .trim()
    .toLowerCase();
  const fallback =
    findFoundingClanFallback(normalizedSlug);

  return {
    title: fallback?.name || "Clan Hall",
    description:
      fallback?.description ||
      "An AoE2WAR clan warhouse for conversation, rivalries, and shared battle history.",
  };
}

export default async function ClanHallPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    view?: string | string[];
  }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};
  const view = normalizeClanView(
    resolvedSearchParams.view,
  );
  const cookieStore = await cookies();
  const claims = await verifySession(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  const normalizedSlug = decodeURIComponent(slug)
    .trim()
    .toLowerCase();
  let snapshot;

  try {
    snapshot = await loadClanHallSnapshot(
      getPrisma(),
      normalizedSlug,
      claims?.uid ?? null,
    );
  } catch (error) {
    console.warn(
      "Failed to load clan hall:",
      error,
    );
    const fallback =
      findFoundingClanFallback(
        normalizedSlug,
      );

    snapshot = fallback
      ? buildClanFallbackSnapshot(
          fallback,
          claims?.uid ?? null,
        )
      : null;
  }

  if (!snapshot) {
    const fallback =
      findFoundingClanFallback(
        normalizedSlug,
      );

    snapshot = fallback
      ? buildClanFallbackSnapshot(
          fallback,
          claims?.uid ?? null,
        )
      : null;
  }

  if (!snapshot) {
    notFound();
  }

  return (
    <ClanHallClient
      initialSnapshot={snapshot}
      initialView={view}
    />
  );
}
