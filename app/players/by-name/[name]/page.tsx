import { notFound, redirect } from "next/navigation";

import PlayerProfilePage from "@/components/players/PlayerProfilePage";
import {
  loadReplayPlayerProfile,
  parsePlayerProfileViewMode,
} from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";
import {
  findUniqueClaimedUserForReplayName,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";

export const dynamic = "force-dynamic";

export default async function ReplayOnlyPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const { name } = await params;
  const resolvedSearchParams: { view?: string | string[] } = searchParams
    ? await searchParams
    : {};
  const playerName = normalizePublicPlayerName(decodeURIComponent(name));

  if (!playerName) {
    notFound();
  }

  const prisma = getPrisma();
  const claimedUser = await findUniqueClaimedUserForReplayName(prisma, playerName);

  if (claimedUser) {
    const viewQuery = resolvedSearchParams.view ? `?view=${encodeURIComponent(String(resolvedSearchParams.view))}` : "";
    redirect(`/players/${claimedUser.uid}${viewQuery}`);
  }

  const profile = await loadReplayPlayerProfile(prisma, playerName);

  if (!profile) {
    notFound();
  }

  return (
    <PlayerProfilePage
      profile={profile}
      viewMode={parsePlayerProfileViewMode(resolvedSearchParams.view, "basic")}
    />
  );
}
