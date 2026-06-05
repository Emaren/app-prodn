import { notFound } from "next/navigation";

import PlayerProfilePage from "@/components/players/PlayerProfilePage";
import {
  loadClaimedPlayerProfile,
  parsePlayerProfileViewMode,
} from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ uid: string }>;
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const { uid } = await params;
  const resolvedSearchParams: { view?: string | string[] } = searchParams
    ? await searchParams
    : {};
  const profile = await loadClaimedPlayerProfile(getPrisma(), uid);

  if (!profile) {
    notFound();
  }

  return (
    <PlayerProfilePage
      profile={profile}
      viewMode={parsePlayerProfileViewMode(resolvedSearchParams.view, "advanced")}
    />
  );
}
