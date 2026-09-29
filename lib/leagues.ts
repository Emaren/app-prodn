import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/lib/generated/prisma";
import { resolvePrimaryAdminContact } from "@/lib/contactInbox";
import { buildWoloRestTxLookupUrl } from "@/lib/woloChain";
import { verifyWoloTransfer } from "@/lib/woloBetSettlement";

export const LEAGUE_CREATION_PRICE_WOLO = 100;
export const LEAGUE_MODES = ["rm", "dm"] as const;
export const LEAGUE_TEAM_SIZES = [1, 2, 3, 4] as const;

export type LeagueMode = (typeof LEAGUE_MODES)[number];
export type LeagueTeamSize = (typeof LEAGUE_TEAM_SIZES)[number];

export type PublicLeague = {
  publicId: string;
  slug: string;
  name: string;
  description: string | null;
  mode: LeagueMode;
  teamSize: LeagueTeamSize;
  creatorDisplayName: string;
  creationPriceWolo: number;
  creationTxHash: string;
  creationProofUrl: string | null;
  createdAt: string;
};

export function normalizeLeagueMode(value: unknown): LeagueMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return LEAGUE_MODES.includes(normalized as LeagueMode)
    ? (normalized as LeagueMode)
    : null;
}

export function normalizeLeagueTeamSize(value: unknown): LeagueTeamSize | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return LEAGUE_TEAM_SIZES.includes(parsed as LeagueTeamSize)
    ? (parsed as LeagueTeamSize)
    : null;
}

export function normalizeLeagueRequestId(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{16,80}$/.test(normalized) ? normalized : null;
}

export function normalizeLeagueLine(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeLeagueDescription(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1200);
}

export function normalizeLeagueTxHash(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(normalized) ? normalized : null;
}

export function normalizeLeagueWoloAddress(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(normalized) ? normalized : null;
}

export function buildLeagueCreationMemo(input: {
  requestId: string;
  creatorUid: string;
}) {
  return `AoE2WAR League · create · ${input.requestId} · ${input.creatorUid} · ${LEAGUE_CREATION_PRICE_WOLO} WOLO`;
}

function leagueSlugBase(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110) || "league";
}

export function newLeagueIdentity(name: string) {
  const publicId = randomUUID();
  return {
    publicId,
    slug: `${leagueSlugBase(name)}-${publicId.slice(0, 8)}`,
  };
}

export async function resolveLeagueCommissioner(prisma: PrismaClient) {
  const contact = await resolvePrimaryAdminContact(prisma);
  if (!contact) {
    throw new Error("The Commissioner is unavailable. Try again shortly.");
  }

  const user = await prisma.user.findUnique({
    where: { id: contact.id },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
    },
  });

  const walletAddress = normalizeLeagueWoloAddress(user?.walletAddress);
  if (!user || !walletAddress) {
    throw new Error("The Commissioner does not have a linked WOLO wallet.");
  }

  return {
    id: user.id,
    uid: user.uid,
    displayName: user.inGameName || user.steamPersonaName || user.uid,
    walletAddress,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

async function readLeaguePaymentMemo(txHash: string) {
  const lookupUrl = buildWoloRestTxLookupUrl(txHash);
  if (!lookupUrl) return null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(lookupUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
    }).catch(() => null);

    if (response?.ok) {
      const payload = asRecord(await response.json().catch(() => null));
      const tx = asRecord(payload?.tx);
      const body = asRecord(tx?.body);
      if (typeof body?.memo === "string") return body.memo;
    }

    if (attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  return null;
}

export async function verifyLeagueCreationPayment(input: {
  txHash: unknown;
  fromAddress: unknown;
  toAddress: string;
  creatorUid: string;
  requestId: string;
}) {
  const txHash = normalizeLeagueTxHash(input.txHash);
  const fromAddress = normalizeLeagueWoloAddress(input.fromAddress);
  const toAddress = normalizeLeagueWoloAddress(input.toAddress);

  if (!txHash || !fromAddress || !toAddress) {
    throw new Error("A valid signed WOLO transaction is required.");
  }

  const verification = await verifyWoloTransfer({
    txHash,
    fromAddress,
    toAddress,
    expectedAmountWolo: LEAGUE_CREATION_PRICE_WOLO,
  });

  if (!verification.verified) {
    throw new Error(
      verification.detail ||
        "The 100 WOLO league creation payment has not appeared on WoloChain yet.",
    );
  }

  const expectedMemo = buildLeagueCreationMemo({
    requestId: input.requestId,
    creatorUid: input.creatorUid,
  });
  const actualMemo = await readLeaguePaymentMemo(txHash);

  if (actualMemo !== expectedMemo) {
    throw new Error(
      "The WOLO transfer is real, but its League creation memo does not match this request.",
    );
  }

  return {
    txHash: verification.txHash || txHash,
    proofUrl: verification.proofUrl || buildWoloRestTxLookupUrl(txHash),
    fromAddress,
    toAddress,
    memo: expectedMemo,
  };
}

export async function loadPublicLeagues(
  prisma: PrismaClient,
  limit = 80,
): Promise<PublicLeague[]> {
  try {
    const rows = await prisma.league.findMany({
      where: { status: "active" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(200, limit)),
    });

    return rows.flatMap((row) => {
      const mode = normalizeLeagueMode(row.mode);
      const teamSize = normalizeLeagueTeamSize(row.teamSize);
      if (!mode || !teamSize) return [];

      return [{
        publicId: row.publicId,
        slug: row.slug,
        name: row.name,
        description: row.description,
        mode,
        teamSize,
        creatorDisplayName: row.creatorDisplayNameSnapshot,
        creationPriceWolo: row.creationPriceWolo,
        creationTxHash: row.creationTxHash,
        creationProofUrl: row.creationProofUrl,
        createdAt: row.createdAt.toISOString(),
      }];
    });
  } catch (error) {
    console.warn("League registry unavailable; returning an empty public league slate:", error);
    return [];
  }
}
