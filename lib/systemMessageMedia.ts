export const CLAN_INVITE_BACKGROUND_TARGET =
  "system-clan-invite-background";

function slotToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function mediaUrl(
  kind: string,
  target: string,
  fallback?: string | null,
) {
  const params =
    fallback &&
    fallback.startsWith("/") &&
    !fallback.startsWith("//")
      ? `?fallback=${encodeURIComponent(fallback)}`
      : "";

  return `/api/media-assets/${encodeURIComponent(kind)}/${encodeURIComponent(target)}${params}`;
}

export function clanInviteBackgroundUrl() {
  return mediaUrl(
    "background",
    CLAN_INVITE_BACKGROUND_TARGET,
  );
}

export function clanInviteCrestTarget(
  clanSlug: string,
) {
  return `clan-${slotToken(clanSlug)}-crest`;
}

export function clanInviteCrestUrl(
  clanSlug: string,
) {
  return mediaUrl(
    "crest",
    clanInviteCrestTarget(clanSlug),
  );
}

export function marketplaceBusinessHeroTarget(
  shopSlug: string,
) {
  return `business-${slotToken(shopSlug)}-hero`;
}

export function marketplaceBusinessSignTarget(
  shopSlug: string,
) {
  return `business-${slotToken(shopSlug)}-sign`;
}

export function marketplaceBusinessHeroUrl(
  shopSlug: string,
  fallback?: string | null,
) {
  return mediaUrl(
    "background",
    marketplaceBusinessHeroTarget(shopSlug),
    fallback,
  );
}

export function marketplaceBusinessSignUrl(
  shopSlug: string,
) {
  return mediaUrl(
    "logo",
    marketplaceBusinessSignTarget(shopSlug),
  );
}


export function marketplaceBusinessProposalHeroTarget(
  proposalEventId: number,
) {
  return `business-proposal-${proposalEventId}-hero`;
}

export function marketplaceBusinessProposalSignTarget(
  proposalEventId: number,
) {
  return `business-proposal-${proposalEventId}-sign`;
}

export function marketplaceBusinessProposalHeroUrl(
  proposalEventId: number,
) {
  return mediaUrl(
    "background",
    marketplaceBusinessProposalHeroTarget(
      proposalEventId,
    ),
  );
}

export function marketplaceBusinessProposalSignUrl(
  proposalEventId: number,
) {
  return mediaUrl(
    "logo",
    marketplaceBusinessProposalSignTarget(
      proposalEventId,
    ),
  );
}
