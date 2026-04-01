import { cookies } from "next/headers";

import HomePageClient from "@/app/HomePageClient";
import { readGuestReactionSessionIdFromCookies } from "@/lib/guestReactionSession";
import { loadLobbySnapshot } from "@/lib/lobbySnapshot";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const initialLobby = await loadLobbySnapshot(
    getPrisma(),
    claims?.uid ?? null,
    readGuestReactionSessionIdFromCookies(cookieStore)
  );

  return <HomePageClient initialLobby={initialLobby} />;
}
