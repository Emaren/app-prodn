import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import ClanHallClient from "@/components/clans/ClanHallClient";
import {
  buildMystikalFallbackSnapshot,
  loadClanHallSnapshot,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mystikal Clan",
  description:
    "The Mystikal Clan hall on AoE2WAR: clan chat with public, signed-in, and clan-only audiences.",
};

export default async function ClanHallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const claims = await verifySession(
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  );
  const normalizedSlug = decodeURIComponent(slug).toLowerCase();
  let snapshot;
  try {
    snapshot = await loadClanHallSnapshot(
      getPrisma(),
      normalizedSlug,
      claims?.uid ?? null
    );
  } catch (error) {
    console.warn("Failed to load clan hall:", error);
    snapshot =
      normalizedSlug === "mystikal"
        ? buildMystikalFallbackSnapshot(claims?.uid ?? null)
        : null;
  }

  if (!snapshot) notFound();

  return <ClanHallClient initialSnapshot={snapshot} />;
}
