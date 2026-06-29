// /var/www/AoE2HDBets/app-prodn/app/api/user/me/route.ts

import { NextResponse, type NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { hydrateSteamIdentity } from "@/lib/steamIdentity";
import { fetchUserVerification, toUserApi } from "@/lib/userDto";
import { loadPendingWoloClaimSummaryForUser } from "@/lib/pendingWoloClaims";
import { resolveRequestUid, resolveRequestEmail } from "@/lib/requestIdentity";
import { validateWoloAddress } from "@/lib/woloBetSettlement";
import { allChampionTitles, type ChampionTitleDefinition } from "@/lib/champions/titles";
import {
  managedMediaPublicUrl,
  normalizeManagedMediaTarget,
  resolveManagedMediaUrl,
} from "@/lib/managedMediaAssets";
import {
  loadUserTrophyHoldings,
  recordNationalityChange,
} from "@/lib/trophies/service";
import {
  GENDER_DIVISIONS,
  REPRESENTED_COUNTRIES,
  type GenderDivision,
  type RepresentedCountry,
} from "@/lib/champions/titles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeInGameName(name: string) {
  return name.trim().replace(/\s+/g, " ").slice(0, 64);
}

function nameLooksValid(name: string) {
  // keep it permissive; you can tighten later
  if (name.length < 2) return false;
  if (name.length > 64) return false;
  return true;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeWalletAddress(address: string) {
  return address.trim();
}

function normalizeTwitchStreamUrl(raw: unknown) {
  if (raw === null || typeof raw === "undefined") {
    return null;
  }
  if (typeof raw !== "string") {
    throw new Error("Twitch stream URL must be text.");
  }

  const value = raw.trim();
  if (!value) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error("Enter a valid Twitch stream URL.");
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host !== "twitch.tv") {
    throw new Error("Use a Twitch channel URL for Broadcast.");
  }

  const channel = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0];
  if (
    !channel ||
    ["directory", "videos", "p", "settings", "downloads"].includes(channel.toLowerCase())
  ) {
    throw new Error("Use a Twitch channel URL for Broadcast.");
  }

  return `https://www.twitch.tv/${channel.slice(0, 80)}`;
}

function normalizeRepresentedCountry(raw: unknown): RepresentedCountry | null {
  if (raw === null || typeof raw === "undefined") return null;
  if (typeof raw !== "string") {
    throw new Error("Representing Country must be text.");
  }

  const value = raw.trim();
  if (!value) return null;

  const country = REPRESENTED_COUNTRIES.find(
    (option) => option.toLowerCase() === value.toLowerCase()
  );
  if (!country) {
    throw new Error("Choose Canada, USA, Mexico, or UK as Representing Country.");
  }

  return country;
}

function normalizeGenderDivision(raw: unknown): GenderDivision {
  if (typeof raw !== "string") {
    throw new Error("Gender Division must be Man or Woman.");
  }

  const division = GENDER_DIVISIONS.find(
    (option) => option.toLowerCase() === raw.trim().toLowerCase()
  );
  if (!division) {
    throw new Error("Choose Man or Woman as Gender Division.");
  }

  return division;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isPrismaUnique(err: unknown, field?: string) {
  if (!isRecord(err)) return false;

  const code = err["code"];
  if (code !== "P2002") return false;
  if (!field) return true;

  const meta = err["meta"];
  if (!isRecord(meta)) return false;

  const target = meta["target"];
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return false;
}

const USER_SELECT = {
  id: true,
  uid: true,
  email: true,
  token: true,

  inGameName: true,
  verified: true,
  lockName: true,
  walletAddress: true,
  twitchStreamUrl: true,
  representedCountry: true,
  representedCountryUpdatedAt: true,
  genderDivision: true,
  genderDivisionUpdatedAt: true,
  createdAt: true,
  lastSeen: true,
  isAdmin: true,
} as const;


function normalizeNameKey(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function titleHeldByUser(title: ChampionTitleDefinition, userNames: Set<string>) {
  return title.holders.some((holder) => userNames.has(normalizeNameKey(holder.name)));
}

function titleHoldingPayload(title: ChampionTitleDefinition) {
  const assetKind = title.type === "designation" ? "artifact" : "belt";

  return {
    id: title.id,
    type: title.type,
    displayName: title.displayName,
    shortName: title.shortName,
    dailyWolo: title.dailyWolo,
    routeHref: title.routeHref,
    assetUrl: managedMediaPublicUrl(assetKind, title.id, title.assetUrl),
  };
}

async function buildProfilePresentation(
  prisma: ReturnType<typeof getPrisma>,
  user: { id: number; uid: string; inGameName: string | null },
  steamPersonaName: string | null
) {
  let holdings = await loadUserTrophyHoldings(prisma, user.id).catch((error) => {
    console.warn("Trophy profile holdings unavailable; using static title fallback:", error);
    return [];
  });
  if (holdings.length === 0) {
    const userNames = new Set(
      [user.inGameName, steamPersonaName]
        .map(normalizeNameKey)
        .filter(Boolean)
    );
    holdings = allChampionTitles
      .filter((title) => titleHeldByUser(title, userNames))
      .map((title) => ({
        ...titleHoldingPayload(title),
        kind: title.type === "designation" ? "artifact" : "belt",
        family: title.type,
        bountyGrowthWolo: title.dailyWolo,
        currentBountyWolo: 0,
        holderSince: null,
        status: "held",
        chainStatus: "app_only",
        nftId: null,
        eligibleNationality: title.country ?? null,
      }));
  }
  const belts = holdings.filter((title) => title.kind !== "artifact");
  const artifacts = holdings.filter((title) => title.kind === "artifact");
  const earningWoloPerDay = holdings.reduce((sum, title) => sum + title.dailyWolo, 0);

  const selectedAvatarTarget = normalizeManagedMediaTarget(`user-${user.uid}`) || `user-${user.uid}`;
  const avatarPoolTarget = normalizeManagedMediaTarget(`user-${user.uid}-pool`) || `user-${user.uid}-pool`;
  const assignedAvatarAssets = await prisma.managedMediaAsset.findMany({
    where: {
      kind: "avatar",
      target: avatarPoolTarget,
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
  });
  const selectedAvatar = assignedAvatarAssets.find((asset) => asset.active) || null;
  const fallbackAvatar = "/champions/players/silhouette.webp";

  return {
    avatarUrl:
      selectedAvatar?.url ||
      (await resolveManagedMediaUrl(prisma, "avatar", selectedAvatarTarget, fallbackAvatar)),
    avatarOptions: assignedAvatarAssets.map((asset) => ({
      target: `asset:${asset.id}`,
      label: asset.label,
      url: asset.url,
      active: asset.active,
    })),
    belts,
    artifacts,
    earningWoloPerDay,
  };
}

export async function GET(request: NextRequest) {
  const uid = await resolveRequestUid(request);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: USER_SELECT,
  });

  if (!user) return NextResponse.json({ detail: "User not found" }, { status: 404 });

  let verification = await fetchUserVerification(prisma, uid);
  if (verification.steamId) {
    const hydration = await hydrateSteamIdentity(prisma, uid);
    verification = hydration.verification;
    if (hydration.seededPlayableName) {
      const refreshedUser = await prisma.user.findUnique({
        where: { uid },
        select: USER_SELECT,
      });

      if (refreshedUser) {
        const claimSummary = await loadPendingWoloClaimSummaryForUser(prisma, {
          id: refreshedUser.id,
          inGameName: refreshedUser.inGameName,
          steamPersonaName: verification.steamPersonaName ?? null,
        });
        const presentation = await buildProfilePresentation(
          prisma,
          refreshedUser,
          verification.steamPersonaName ?? null
        );
        return NextResponse.json({
          ...toUserApi(refreshedUser, verification),
          ...presentation,
          pendingClaimAmountWolo: claimSummary.pendingAmountWolo,
          pendingClaimCount: claimSummary.pendingCount,
          pendingClaimLatestCreatedAt: claimSummary.latestCreatedAt,
        });
      }
    }
  }

  const claimSummary = await loadPendingWoloClaimSummaryForUser(prisma, {
    id: user.id,
    inGameName: user.inGameName,
    steamPersonaName: verification.steamPersonaName ?? null,
  });
  const presentation = await buildProfilePresentation(
    prisma,
    user,
    verification.steamPersonaName ?? null
  );

  return NextResponse.json({
    ...toUserApi(user, verification),
    ...presentation,
    pendingClaimAmountWolo: claimSummary.pendingAmountWolo,
    pendingClaimCount: claimSummary.pendingCount,
    pendingClaimLatestCreatedAt: claimSummary.latestCreatedAt,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const uid = await resolveRequestUid(request, body);
  if (!uid) return NextResponse.json({ detail: "No active session" }, { status: 401 });

  const emailRaw = resolveRequestEmail(request, body);
  const emailNorm =
    typeof emailRaw === "string" && emailRaw.trim() ? normalizeEmail(emailRaw) : null;

  const incomingName =
    typeof body?.inGameName === "string"
      ? body.inGameName
      : typeof body?.in_game_name === "string"
        ? body.in_game_name
        : null;
  const incomingWalletAddress =
    typeof body?.walletAddress === "string"
      ? normalizeWalletAddress(body.walletAddress)
      : typeof body?.wallet_address === "string"
        ? normalizeWalletAddress(body.wallet_address)
        : null;
  const hasTwitchUpdate =
    Object.prototype.hasOwnProperty.call(body, "twitchStreamUrl") ||
    Object.prototype.hasOwnProperty.call(body, "twitch_stream_url");
  let incomingTwitchStreamUrl: string | null = null;
  const hasRepresentedCountryUpdate =
    Object.prototype.hasOwnProperty.call(body, "representedCountry") ||
    Object.prototype.hasOwnProperty.call(body, "represented_country");
  const hasGenderDivisionUpdate =
    Object.prototype.hasOwnProperty.call(body, "genderDivision") ||
    Object.prototype.hasOwnProperty.call(body, "gender_division");
  let incomingRepresentedCountry: RepresentedCountry | null = null;
  let incomingGenderDivision: GenderDivision | null = null;

  if (hasTwitchUpdate) {
    try {
      incomingTwitchStreamUrl = normalizeTwitchStreamUrl(
        Object.prototype.hasOwnProperty.call(body, "twitchStreamUrl")
          ? body.twitchStreamUrl
          : body.twitch_stream_url
      );
    } catch (error) {
      return NextResponse.json(
        { detail: error instanceof Error ? error.message : "Invalid Twitch stream URL." },
        { status: 400 }
      );
    }
  }

  if (hasRepresentedCountryUpdate) {
    try {
      incomingRepresentedCountry = normalizeRepresentedCountry(
        Object.prototype.hasOwnProperty.call(body, "representedCountry")
          ? body.representedCountry
          : body.represented_country
      );
    } catch (error) {
      return NextResponse.json(
        { detail: error instanceof Error ? error.message : "Invalid Representing Country." },
        { status: 400 }
      );
    }
  }

  if (hasGenderDivisionUpdate) {
    try {
      incomingGenderDivision = normalizeGenderDivision(
        Object.prototype.hasOwnProperty.call(body, "genderDivision")
          ? body.genderDivision
          : body.gender_division
      );
    } catch (error) {
      return NextResponse.json(
        { detail: error instanceof Error ? error.message : "Invalid Gender Division." },
        { status: 400 }
      );
    }
  }

  if (incomingWalletAddress) {
    const addressError = validateWoloAddress(incomingWalletAddress);
    if (addressError) {
      return NextResponse.json({ detail: addressError }, { status: 400 });
    }
  }

  const prisma = getPrisma();

  const existing = await prisma.user.findUnique({
    where: { uid },
    select: USER_SELECT,
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Create / attach-by-email branch (fixes "Unique constraint failed on (email)")
  // ────────────────────────────────────────────────────────────────────────────
  if (!existing) {
    // If we have an email and that email already exists, attach this uid to that record.
    if (emailNorm) {
      const byEmail = await prisma.user.findUnique({
        where: { email: emailNorm },
        select: USER_SELECT,
      });

      if (byEmail) {
        // If same uid already, just return it.
        if (byEmail.uid === uid) {
          return NextResponse.json(toUserApi(byEmail));
        }

        // Only update name if provided and not locked, and it actually changes.
        let nextName: string | null = byEmail.inGameName ?? null;
        if (incomingName && !byEmail.lockName) {
          const n = normalizeInGameName(incomingName);
          if (nameLooksValid(n) && n !== (byEmail.inGameName ?? "")) {
            nextName = n;
          }
        }

        const updated = await prisma.user.update({
          where: { email: emailNorm },
          data: {
            uid,
            // keep email as-is (already emailNorm)
            inGameName: nextName,
            walletAddress: incomingWalletAddress || byEmail.walletAddress,
            twitchStreamUrl: hasTwitchUpdate
              ? incomingTwitchStreamUrl
              : byEmail.twitchStreamUrl,
            representedCountry: hasRepresentedCountryUpdate
              ? incomingRepresentedCountry
              : byEmail.representedCountry,
            representedCountryUpdatedAt: hasRepresentedCountryUpdate
              ? new Date()
              : byEmail.representedCountryUpdatedAt,
            genderDivision: hasGenderDivisionUpdate
              ? incomingGenderDivision!
              : byEmail.genderDivision || "Man",
            genderDivisionUpdatedAt: hasGenderDivisionUpdate
              ? new Date()
              : byEmail.genderDivisionUpdatedAt,
          },
          select: USER_SELECT,
        });

        return NextResponse.json(toUserApi(updated, await fetchUserVerification(prisma, updated.uid)));
      }
    }

    // Otherwise create new. If a race causes P2002(email), fall back to attach-by-email.
    try {
      const created = await prisma.user.create({
        data: {
          uid,
          email: emailNorm,
          inGameName: incomingName ? normalizeInGameName(incomingName) : null,
          walletAddress: incomingWalletAddress,
          twitchStreamUrl: hasTwitchUpdate ? incomingTwitchStreamUrl : null,
          representedCountry: hasRepresentedCountryUpdate ? incomingRepresentedCountry : null,
          representedCountryUpdatedAt: hasRepresentedCountryUpdate ? new Date() : null,
          genderDivision: hasGenderDivisionUpdate ? incomingGenderDivision! : "Man",
          genderDivisionUpdatedAt: hasGenderDivisionUpdate ? new Date() : null,
          isAdmin: false,
        },
        select: USER_SELECT,
      });

      return NextResponse.json(toUserApi(created, await fetchUserVerification(prisma, created.uid)));
    } catch (err) {
      // If email was unique and collided, attach to existing-by-email.
      if (emailNorm && isPrismaUnique(err, "email")) {
        const byEmail = await prisma.user.findUnique({
          where: { email: emailNorm },
          select: USER_SELECT,
        });

        if (byEmail) {
          const updated = await prisma.user.update({
            where: { email: emailNorm },
            data: {
              uid,
              walletAddress: incomingWalletAddress || byEmail.walletAddress,
              twitchStreamUrl: hasTwitchUpdate
                ? incomingTwitchStreamUrl
                : byEmail.twitchStreamUrl,
              representedCountry: hasRepresentedCountryUpdate
                ? incomingRepresentedCountry
                : byEmail.representedCountry,
              representedCountryUpdatedAt: hasRepresentedCountryUpdate
                ? new Date()
                : byEmail.representedCountryUpdatedAt,
              genderDivision: hasGenderDivisionUpdate
                ? incomingGenderDivision!
                : byEmail.genderDivision || "Man",
              genderDivisionUpdatedAt: hasGenderDivisionUpdate
                ? new Date()
                : byEmail.genderDivisionUpdatedAt,
            },
            select: USER_SELECT,
          });

          return NextResponse.json(toUserApi(updated, await fetchUserVerification(prisma, updated.uid)));
        }
      }
      throw err;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Update branch
  // ────────────────────────────────────────────────────────────────────────────

  // update email if provided
  const wantsEmailUpdate =
    typeof emailNorm === "string" && emailNorm.trim() && emailNorm !== (existing.email ?? null);

  // update name if provided
  const wantsNameUpdate =
    typeof incomingName === "string" &&
    normalizeInGameName(incomingName) !== (existing.inGameName ?? "");
  const wantsWalletUpdate =
    typeof incomingWalletAddress === "string" &&
    incomingWalletAddress.length > 0 &&
    incomingWalletAddress !== (existing.walletAddress ?? "");
  const wantsTwitchUpdate =
    hasTwitchUpdate && incomingTwitchStreamUrl !== (existing.twitchStreamUrl ?? null);
  const wantsRepresentedCountryUpdate =
    hasRepresentedCountryUpdate && incomingRepresentedCountry !== (existing.representedCountry ?? null);
  const wantsGenderDivisionUpdate =
    hasGenderDivisionUpdate && incomingGenderDivision !== (existing.genderDivision || "Man");

  if (
    !wantsEmailUpdate &&
    !wantsNameUpdate &&
    !wantsWalletUpdate &&
    !wantsTwitchUpdate &&
    !wantsRepresentedCountryUpdate &&
    !wantsGenderDivisionUpdate
  ) {
    return NextResponse.json(toUserApi(existing, await fetchUserVerification(prisma, existing.uid)));
  }

  if (wantsNameUpdate) {
    if (existing.lockName) {
      return NextResponse.json(
        { detail: "Name is locked (verified). Use admin tools to change." },
        { status: 403 }
      );
    }

    const nextName = normalizeInGameName(incomingName!);
    if (!nameLooksValid(nextName)) {
      return NextResponse.json({ detail: "Invalid in-game name" }, { status: 400 });
    }

    try {
      const updated = await prisma.user.update({
        where: { uid },
        data: {
          email: wantsEmailUpdate ? (emailNorm as string) : existing.email,
          inGameName: nextName,
          walletAddress: wantsWalletUpdate ? incomingWalletAddress : existing.walletAddress,
          twitchStreamUrl: wantsTwitchUpdate
            ? incomingTwitchStreamUrl
            : existing.twitchStreamUrl,
          representedCountry: wantsRepresentedCountryUpdate
            ? incomingRepresentedCountry
            : existing.representedCountry,
          representedCountryUpdatedAt: wantsRepresentedCountryUpdate
            ? new Date()
            : existing.representedCountryUpdatedAt,
          genderDivision: wantsGenderDivisionUpdate
            ? incomingGenderDivision!
            : existing.genderDivision || "Man",
          genderDivisionUpdatedAt: wantsGenderDivisionUpdate
            ? new Date()
            : existing.genderDivisionUpdatedAt,
          verified: false,
          lockName: false,
        },
        select: USER_SELECT,
      });

      const verification = await fetchUserVerification(prisma, uid);
      const steamLinked = Boolean(verification.steamId);

      await prisma.$executeRaw`
        UPDATE public.users
        SET
          verification_level = ${steamLinked ? 1 : 0},
          verification_method = ${steamLinked ? "steam" : "none"},
          verified_at = NULL
        WHERE uid = ${uid}
      `;

      if (wantsRepresentedCountryUpdate) {
        await recordNationalityChange(prisma, {
          userId: updated.id,
          previousCountry: existing.representedCountry,
          nextCountry: updated.representedCountry,
          initiatedBy: "user",
        });
      }

      return NextResponse.json(
        toUserApi(updated, {
          ...verification,
          verificationLevel: steamLinked ? 1 : 0,
          verificationMethod: steamLinked ? "steam" : "none",
          verifiedAt: null,
        })
      );
    } catch (err) {
      if (wantsEmailUpdate && isPrismaUnique(err, "email")) {
        return NextResponse.json({ detail: "Email already in use" }, { status: 409 });
      }
      throw err;
    }
  }

  try {
    const updated = await prisma.user.update({
      where: { uid },
      data: {
        email: wantsEmailUpdate ? (emailNorm as string) : existing.email,
        walletAddress: wantsWalletUpdate ? incomingWalletAddress : existing.walletAddress,
        twitchStreamUrl: wantsTwitchUpdate
          ? incomingTwitchStreamUrl
          : existing.twitchStreamUrl,
        representedCountry: wantsRepresentedCountryUpdate
          ? incomingRepresentedCountry
          : existing.representedCountry,
        representedCountryUpdatedAt: wantsRepresentedCountryUpdate
          ? new Date()
          : existing.representedCountryUpdatedAt,
        genderDivision: wantsGenderDivisionUpdate
          ? incomingGenderDivision!
          : existing.genderDivision || "Man",
        genderDivisionUpdatedAt: wantsGenderDivisionUpdate
          ? new Date()
          : existing.genderDivisionUpdatedAt,
      },
      select: USER_SELECT,
    });

    if (wantsRepresentedCountryUpdate) {
      await recordNationalityChange(prisma, {
        userId: updated.id,
        previousCountry: existing.representedCountry,
        nextCountry: updated.representedCountry,
        initiatedBy: "user",
      });
    }

    return NextResponse.json(toUserApi(updated, await fetchUserVerification(prisma, updated.uid)));
  } catch (err) {
    if (wantsEmailUpdate && isPrismaUnique(err, "email")) {
      return NextResponse.json({ detail: "Email already in use" }, { status: 409 });
    }
    throw err;
  }
}
