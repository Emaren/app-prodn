import { cookies } from "next/headers";

import LobbyClientOnly from "@/app/lobby/LobbyClientOnly";
import { loadActiveEventTile } from "@/lib/events/service";
import { readGuestReactionSessionIdFromCookies } from "@/lib/guestReactionSession";
import { loadLobbySnapshot } from "@/lib/lobbySnapshot";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const prisma = getPrisma();
  const [initialLobby, initialEventTile] = await Promise.all([
    loadLobbySnapshot(
      prisma,
      claims?.uid ?? null,
      readGuestReactionSessionIdFromCookies(cookieStore)
    ),
    loadActiveEventTile(prisma),
  ]);

  return (
    <LobbyClientOnly
      initialLobby={initialLobby}
      initialEventTile={initialEventTile}
    />
  );
}
