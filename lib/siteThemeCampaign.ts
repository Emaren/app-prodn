import type { PrismaClient } from "@/lib/generated/prisma";
import {
  DEFAULT_LOBBY_THEME,
  isLobbyThemeKey,
  type LobbyThemeKey,
} from "@/components/lobby/lobbyPresentation";

export const SITE_THEME_CAMPAIGN_SLOT = 1;
export const SITE_THEME_CAMPAIGN_EXCLUDED_PATHS = [
  "/academy",
  "/statistics",
  "/traffic",
  "/speed",
] as const;

export type SiteThemeCampaignControl = {
  campaignKey: string;
  label: string;
  enabled: boolean;
  themeKey: LobbyThemeKey;
  appliesToThemeKey: LobbyThemeKey;
  startsAt: string;
  endsAt: string;
  active: boolean;
  excludedPaths: readonly string[];
};

export type SiteThemeCampaignViewerState = {
  campaign: SiteThemeCampaignControl | null;
  overrideThemeKey: LobbyThemeKey | null;
};

type CampaignRow = {
  campaignKey: string;
  label: string;
  enabled: boolean;
  themeKey: string;
  appliesToThemeKey: string;
  startsAt: Date;
  endsAt: Date;
};

export function siteThemeCampaignIsActive(
  campaign: Pick<CampaignRow, "enabled" | "startsAt" | "endsAt">,
  now = new Date(),
) {
  const at = now.getTime();
  return (
    campaign.enabled &&
    Number.isFinite(at) &&
    at >= campaign.startsAt.getTime() &&
    at < campaign.endsAt.getTime()
  );
}

export function siteThemeCampaignAppliesToPathname(pathname: string | null | undefined) {
  const path = String(pathname || "/").trim() || "/";
  return !SITE_THEME_CAMPAIGN_EXCLUDED_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function normalizeCampaignThemeKey(value: string | null | undefined): LobbyThemeKey {
  const candidate = value ?? null;
  return isLobbyThemeKey(candidate) ? candidate : DEFAULT_LOBBY_THEME;
}

export function resolveEffectiveSiteThemeKey(input: {
  preferredThemeKey: LobbyThemeKey;
  overrideThemeKey?: LobbyThemeKey | null;
  campaign?: SiteThemeCampaignControl | null;
  pathname?: string | null;
}) {
  const campaign = input.campaign;
  if (
    !campaign ||
    !campaign.active ||
    !siteThemeCampaignAppliesToPathname(input.pathname)
  ) {
    return input.preferredThemeKey;
  }

  if (input.overrideThemeKey) {
    return input.overrideThemeKey;
  }

  return campaign.themeKey;
}

export function toSiteThemeCampaignControl(
  row: CampaignRow,
  now = new Date(),
): SiteThemeCampaignControl {
  return {
    campaignKey: row.campaignKey,
    label: row.label,
    enabled: row.enabled,
    themeKey: normalizeCampaignThemeKey(row.themeKey),
    appliesToThemeKey: normalizeCampaignThemeKey(row.appliesToThemeKey),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    active: siteThemeCampaignIsActive(row, now),
    excludedPaths: SITE_THEME_CAMPAIGN_EXCLUDED_PATHS,
  };
}

export async function loadSiteThemeCampaign(
  prisma: PrismaClient,
  now = new Date(),
) {
  const row = await prisma.siteThemeCampaign.findUnique({
    where: { slot: SITE_THEME_CAMPAIGN_SLOT },
    select: {
      campaignKey: true,
      label: true,
      enabled: true,
      themeKey: true,
      appliesToThemeKey: true,
      startsAt: true,
      endsAt: true,
    },
  });
  return row ? toSiteThemeCampaignControl(row, now) : null;
}

export async function loadSiteThemeCampaignViewerState(
  prisma: PrismaClient,
  userId: number | null,
  now = new Date(),
): Promise<SiteThemeCampaignViewerState> {
  const campaign = await loadSiteThemeCampaign(prisma, now);
  if (!campaign || !userId) {
    return { campaign, overrideThemeKey: null };
  }

  const override = await prisma.userThemeCampaignOverride.findUnique({
    where: {
      campaignKey_userId: {
        campaignKey: campaign.campaignKey,
        userId,
      },
    },
    select: { themeKey: true },
  });

  return {
    campaign,
    overrideThemeKey: override
      ? normalizeCampaignThemeKey(override.themeKey)
      : null,
  };
}

export async function saveSiteThemeCampaignOverride(
  prisma: PrismaClient,
  input: {
    userId: number;
    campaignKey: string;
    themeKey: LobbyThemeKey;
  },
) {
  return prisma.userThemeCampaignOverride.upsert({
    where: {
      campaignKey_userId: {
        campaignKey: input.campaignKey,
        userId: input.userId,
      },
    },
    create: {
      campaignKey: input.campaignKey,
      userId: input.userId,
      themeKey: input.themeKey,
    },
    update: {
      themeKey: input.themeKey,
    },
  });
}

export async function loadSiteThemeCampaignAdminState(
  prisma: PrismaClient,
  now = new Date(),
) {
  const campaignRow = await prisma.siteThemeCampaign.findUnique({
    where: { slot: SITE_THEME_CAMPAIGN_SLOT },
    select: {
      campaignKey: true,
      label: true,
      enabled: true,
      themeKey: true,
      appliesToThemeKey: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true,
      updatedByUserId: true,
    },
  });

  if (!campaignRow) {
    return {
      campaign: null,
      stats: null,
      overrides: [],
    };
  }

  const campaign = toSiteThemeCampaignControl(campaignRow, now);
  const [users, overrides] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        appearancePreference: {
          select: { themeKey: true },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.userThemeCampaignOverride.findMany({
      where: { campaignKey: campaign.campaignKey },
      select: {
        userId: true,
        themeKey: true,
        updatedAt: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { userId: "asc" }],
    }),
  ]);

  const overrideByUserId = new Map(
    overrides.map((row) => [
      row.userId,
      normalizeCampaignThemeKey(row.themeKey),
    ] as const),
  );

  const effectiveBreakdown = new Map<LobbyThemeKey, number>();
  let campaignDefaultCount = 0;
  let effectiveCampaignThemeCount = 0;
  let existingCustomThemeCount = 0;

  for (const user of users) {
    const preferred = normalizeCampaignThemeKey(
      user.appearancePreference?.themeKey ?? DEFAULT_LOBBY_THEME,
    );
    const override = overrideByUserId.get(user.id) ?? null;
    const effective = resolveEffectiveSiteThemeKey({
      preferredThemeKey: preferred,
      overrideThemeKey: override,
      campaign,
      pathname: "/",
    });

    effectiveBreakdown.set(
      effective,
      (effectiveBreakdown.get(effective) ?? 0) + 1,
    );

    if (campaign.active && !override) {
      campaignDefaultCount += 1;
    }
    if (effective === campaign.themeKey) {
      effectiveCampaignThemeCount += 1;
    }
    if (
      preferred !== campaign.appliesToThemeKey &&
      !override
    ) {
      existingCustomThemeCount += 1;
    }
  }

  return {
    campaign: {
      ...campaign,
      updatedAt: campaignRow.updatedAt.toISOString(),
      updatedByUserId: campaignRow.updatedByUserId,
    },
    stats: {
      totalUsers: users.length,
      campaignDefaultCount,
      effectiveCampaignThemeCount,
      explicitOverrideCount: overrides.length,
      explicitMidnightOverrideCount: overrides.filter(
        (row) => normalizeCampaignThemeKey(row.themeKey) === "midnight",
      ).length,
      existingCustomThemeCount,
      effectiveBreakdown: [
        "black",
        "grey",
        "white",
        "sepia",
        "walnut",
        "crimson",
        "midnight",
      ].map((themeKey) => ({
        themeKey,
        count: effectiveBreakdown.get(themeKey as LobbyThemeKey) ?? 0,
      })),
    },
    overrides: overrides.map((row) => ({
      userId: row.userId,
      uid: row.user.uid,
      displayName:
        row.user.inGameName ||
        row.user.steamPersonaName ||
        row.user.uid,
      themeKey: normalizeCampaignThemeKey(row.themeKey),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}
