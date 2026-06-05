import { notFound, redirect } from "next/navigation";

import PlayerProfilePage from "@/components/players/PlayerProfilePage";
import {
  loadReplayPlayerProfile,
  parsePlayerProfileViewMode,
} from "@/lib/playerProfile";
import { getPrisma } from "@/lib/prisma";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

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
  const claimedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { inGameName: { equals: playerName, mode: "insensitive" } },
        { steamPersonaName: { equals: playerName, mode: "insensitive" } },
      ],
    },
    select: { uid: true },
  });

  if (claimedUser) {
    redirect(`/players/${claimedUser.uid}`);
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
