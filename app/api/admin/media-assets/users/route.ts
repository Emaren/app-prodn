import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { avatarUrlForUser } from "@/lib/avatarAssets";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function cleanSearch(value: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function includesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;

  const q = query.toLowerCase();

  return values.some((value) => String(value || "").toLowerCase().includes(q));
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);

  if ("error" in gate) {
    return gate.error;
  }

  const q = cleanSearch(request.nextUrl.searchParams.get("q"));
  const directory = await loadPublicPlayerDirectory(gate.prisma);

  const entries = directory.allEntries
    .filter((entry) =>
      includesQuery(
        [
          entry.name,
          entry.uid,
          entry.steamId,
          entry.steamPersonaName,
          entry.inGameName,
          ...entry.aliases,
        ],
        q
      )
    )
    .slice(0, 120);

  const existingUsersByUid = new Map(
    (
      await gate.prisma.user.findMany({
        where: {
          uid: {
            in: entries
              .map((entry) => entry.uid)
              .filter((uid): uid is string => Boolean(uid)),
          },
        },
        select: {
          id: true,
          uid: true,
          email: true,
          inGameName: true,
          steamPersonaName: true,
          verified: true,
          verificationLevel: true,
          walletAddress: true,
          representedCountry: true,
          genderDivision: true,
          createdAt: true,
          lastSeen: true,
        },
      })
    ).map((user) => [user.uid, user])
  );

  return NextResponse.json(
    {
      users: entries.map((entry) => {
        const existingUser = entry.uid ? existingUsersByUid.get(entry.uid) : null;
        const displayName =
          existingUser?.inGameName ||
          existingUser?.steamPersonaName ||
          entry.name ||
          entry.uid ||
          "Unknown warrior";

        return {
          key: entry.key,
          source: entry.claimed ? "user" : "replay",
          id: existingUser?.id ?? null,
          uid: existingUser?.uid ?? entry.uid,
          displayName,
          email: existingUser?.email ?? null,
          inGameName: existingUser?.inGameName ?? entry.inGameName,
          steamPersonaName: existingUser?.steamPersonaName ?? entry.steamPersonaName,
          verified: existingUser?.verified ?? entry.verified,
          verificationLevel: existingUser?.verificationLevel ?? entry.verificationLevel,
          walletAddress: existingUser?.walletAddress ?? null,
          representedCountry: existingUser?.representedCountry ?? null,
          genderDivision: existingUser?.genderDivision ?? "Man",
          createdAt: existingUser?.createdAt ?? null,
          lastSeen: existingUser?.lastSeen ?? null,
          steamId: entry.steamId,
          aliases: entry.aliases,
          totalMatches: entry.totalMatches,
          avatarPreviewUrl: existingUser?.uid
            ? avatarUrlForUser(existingUser.uid, displayName)
            : managedMediaPublicUrl(
                "avatar",
                normalizePublicPlayerName(entry.name),
                "/champions/players/silhouette.webp"
              ),
        };
      }),
    },
    { headers: NO_STORE_HEADERS }
  );
}
