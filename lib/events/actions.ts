import type { PrismaClient } from "@/lib/generated/prisma";
import {
  EVENT_TILE_STATUSES,
  isSafeEventMediaUrl,
  type EventTileStatus,
} from "@/lib/events/types";

export class EventStudioActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EventStudioActionError";
    this.status = status;
  }
}

type Payload = Record<string, unknown>;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number) {
  const parsed = text(value, max);
  return parsed || null;
}

function nullableInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function intValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function floatValue(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new EventStudioActionError("Event dates must be valid.");
  }
  return parsed;
}

function slug(value: unknown, fallback = "") {
  return (text(value, 160) || fallback)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function statusValue(value: unknown): EventTileStatus {
  const normalized = text(value, 24).toLowerCase();
  return EVENT_TILE_STATUSES.includes(normalized as EventTileStatus)
    ? (normalized as EventTileStatus)
    : "draft";
}

function color(value: unknown, fallback: string) {
  const normalized = text(value, 24);
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function mediaUrl(value: unknown) {
  const normalized = text(value, 500);
  if (!isSafeEventMediaUrl(normalized)) {
    throw new EventStudioActionError(
      "Event media must use an internal /path or an https:// URL."
    );
  }
  return normalized || null;
}

function ctaUrl(value: unknown) {
  const normalized = text(value, 500);
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new EventStudioActionError("Event CTA must use a safe internal /path.");
  }
  return normalized;
}

function publishErrors(event: {
  eventTileId: string;
  slug: string;
  status: string;
  name: string;
  eyebrow: string | null;
  title: string;
  chapterLabel: string | null;
  dateLabel: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  playerOneName: string | null;
  playerOneAvatarUrl: string | null;
  playerTwoName: string | null;
  playerTwoAvatarUrl: string | null;
  commissionerName: string | null;
  commissionerAvatarUrl: string | null;
  beltImageUrl: string | null;
}) {
  const missing = [
    ["event id", event.eventTileId],
    ["slug", event.slug],
    ["name", event.name],
    ["eyebrow", event.eyebrow],
    ["title", event.title],
    ["chapter label", event.chapterLabel],
    ["date label", event.dateLabel],
    ["CTA label", event.ctaLabel],
    ["CTA URL", event.ctaUrl],
    ["player one name", event.playerOneName],
    ["player one avatar", event.playerOneAvatarUrl],
    ["player two name", event.playerTwoName],
    ["player two avatar", event.playerTwoAvatarUrl],
    ["Commissioner name", event.commissionerName],
    ["Commissioner avatar", event.commissionerAvatarUrl],
    ["belt image", event.beltImageUrl],
  ].filter(([, value]) => !value).map(([label]) => label);

  if (event.status === "archived") missing.push("non-archived status");
  if (event.ctaUrl && (!event.ctaUrl.startsWith("/") || event.ctaUrl.startsWith("//"))) {
    missing.push("safe internal CTA URL");
  }
  for (const [label, value] of [
    ["player one avatar", event.playerOneAvatarUrl],
    ["player two avatar", event.playerTwoAvatarUrl],
    ["Commissioner avatar", event.commissionerAvatarUrl],
    ["belt image", event.beltImageUrl],
  ] as const) {
    if (!isSafeEventMediaUrl(value)) missing.push(`safe ${label}`);
  }
  return [...new Set(missing)];
}

async function getEvent(prisma: PrismaClient, payload: Payload) {
  const id = nullableInt(payload.id);
  if (!id) throw new EventStudioActionError("Choose an event tile.");
  const event = await prisma.eventTile.findUnique({ where: { id } });
  if (!event) throw new EventStudioActionError("Event tile not found.", 404);
  return event;
}

async function saveEvent(prisma: PrismaClient, payload: Payload) {
  const id = nullableInt(payload.id);
  const name = text(payload.name, 160);
  const title = text(payload.title, 180);
  const eventTileId = slug(payload.eventTileId, slug(name || title || "event"));
  const eventSlug = slug(payload.slug, eventTileId);
  if (!eventTileId || !eventSlug || !name || !title) {
    throw new EventStudioActionError("Event id, slug, name, and title are required.");
  }

  const data = {
    eventTileId,
    slug: eventSlug,
    status: statusValue(payload.status),
    priority: intValue(payload.priority),
    name,
    eyebrow: optionalText(payload.eyebrow, 160),
    title,
    subtitle: optionalText(payload.subtitle, 220),
    description: optionalText(payload.description, 4000),
    chapterLabel: optionalText(payload.chapterLabel, 160),
    dateLabel: optionalText(payload.dateLabel, 160),
    eventStartsAt: dateValue(payload.eventStartsAt),
    eventEndsAt: dateValue(payload.eventEndsAt),
    payoutBadgeText: optionalText(payload.payoutBadgeText, 120),
    featuredBadgeText: optionalText(payload.featuredBadgeText, 120),
    ctaLabel: optionalText(payload.ctaLabel, 120),
    ctaUrl: payload.ctaUrl ? ctaUrl(payload.ctaUrl) : null,
    matchFormat: optionalText(payload.matchFormat, 120),
    rulesSummary: optionalText(payload.rulesSummary, 255),
    tournamentName: optionalText(payload.tournamentName, 180),
    linkedTrophyId: nullableInt(payload.linkedTrophyId),
    playerOneUserId: nullableInt(payload.playerOneUserId),
    playerOneName: optionalText(payload.playerOneName, 120),
    playerOneAvatarUrl: mediaUrl(payload.playerOneAvatarUrl),
    playerTwoUserId: nullableInt(payload.playerTwoUserId),
    playerTwoName: optionalText(payload.playerTwoName, 120),
    playerTwoAvatarUrl: mediaUrl(payload.playerTwoAvatarUrl),
    commissionerUserId: nullableInt(payload.commissionerUserId),
    commissionerName: optionalText(payload.commissionerName, 120),
    commissionerAvatarUrl: mediaUrl(payload.commissionerAvatarUrl),
    beltImageUrl: mediaUrl(payload.beltImageUrl),
    backgroundImageUrl: mediaUrl(payload.backgroundImageUrl),
    mobileBackgroundImageUrl: mediaUrl(payload.mobileBackgroundImageUrl),
    gradientFrom: color(payload.gradientFrom, "#150704"),
    gradientVia: color(payload.gradientVia, "#05070d"),
    gradientTo: color(payload.gradientTo, "#071225"),
    overlayOpacity: Math.min(1, Math.max(0, floatValue(payload.overlayOpacity, 0.24))),
    vignetteOpacity: Math.min(1, Math.max(0, floatValue(payload.vignetteOpacity, 0.82))),
    theme: text(payload.theme, 40) || "royal",
  };

  try {
    if (id) {
      return await prisma.eventTile.update({ where: { id }, data });
    }
    return await prisma.eventTile.create({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unique constraint")) {
      throw new EventStudioActionError("Event id and slug must be unique.");
    }
    throw error;
  }
}

async function duplicateEvent(prisma: PrismaClient, payload: Payload) {
  const event = await getEvent(prisma, payload);
  let suffix = 2;
  let eventTileId = `${event.eventTileId}-copy`;
  let eventSlug = `${event.slug}-copy`;
  while (
    await prisma.eventTile.findFirst({
      where: { OR: [{ eventTileId }, { slug: eventSlug }] },
      select: { id: true },
    })
  ) {
    eventTileId = `${event.eventTileId}-copy-${suffix}`;
    eventSlug = `${event.slug}-copy-${suffix}`;
    suffix += 1;
  }

  return prisma.eventTile.create({
    data: {
      eventTileId,
      slug: eventSlug,
      name: `${event.name} Copy`,
      status: "draft",
      priority: Math.max(0, event.priority - 1),
      isPublished: false,
      isActive: false,
      eyebrow: event.eyebrow,
      title: event.title,
      subtitle: event.subtitle,
      description: event.description,
      chapterLabel: event.chapterLabel,
      dateLabel: event.dateLabel,
      eventStartsAt: event.eventStartsAt,
      eventEndsAt: event.eventEndsAt,
      payoutBadgeText: event.payoutBadgeText,
      featuredBadgeText: event.featuredBadgeText,
      ctaLabel: event.ctaLabel,
      ctaUrl: event.ctaUrl,
      matchFormat: event.matchFormat,
      rulesSummary: event.rulesSummary,
      tournamentName: event.tournamentName,
      linkedTrophyId: event.linkedTrophyId,
      playerOneUserId: event.playerOneUserId,
      playerOneName: event.playerOneName,
      playerOneAvatarUrl: event.playerOneAvatarUrl,
      playerTwoUserId: event.playerTwoUserId,
      playerTwoName: event.playerTwoName,
      playerTwoAvatarUrl: event.playerTwoAvatarUrl,
      commissionerUserId: event.commissionerUserId,
      commissionerName: event.commissionerName,
      commissionerAvatarUrl: event.commissionerAvatarUrl,
      beltImageUrl: event.beltImageUrl,
      backgroundImageUrl: event.backgroundImageUrl,
      mobileBackgroundImageUrl: event.mobileBackgroundImageUrl,
      gradientFrom: event.gradientFrom,
      gradientVia: event.gradientVia,
      gradientTo: event.gradientTo,
      overlayOpacity: event.overlayOpacity,
      vignetteOpacity: event.vignetteOpacity,
      theme: event.theme,
      publishedAt: null,
    },
  });
}

async function publishEvent(prisma: PrismaClient, payload: Payload, active: boolean) {
  const event = await getEvent(prisma, payload);
  const missing = publishErrors(event);
  if (missing.length) {
    throw new EventStudioActionError(`Cannot publish: add ${missing.join(", ")}.`);
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    if (active) {
      await tx.eventTile.updateMany({
        where: { id: { not: event.id }, isActive: true },
        data: { isActive: false },
      });
    }
    return tx.eventTile.update({
      where: { id: event.id },
      data: {
        isPublished: true,
        isActive: active ? true : event.isActive,
        publishedAt: event.publishedAt ?? now,
        status: event.status === "draft" ? "scheduled" : event.status,
      },
    });
  });
}

export async function executeEventStudioAction(
  prisma: PrismaClient,
  payload: Payload
) {
  const action = text(payload.action, 40);
  if (action === "save") return saveEvent(prisma, payload);
  if (action === "duplicate") return duplicateEvent(prisma, payload);
  if (action === "publish") return publishEvent(prisma, payload, false);
  if (action === "set_active") return publishEvent(prisma, payload, true);
  if (action === "unpublish") {
    const event = await getEvent(prisma, payload);
    return prisma.eventTile.update({
      where: { id: event.id },
      data: { isPublished: false, isActive: false },
    });
  }
  if (action === "archive") {
    const event = await getEvent(prisma, payload);
    return prisma.eventTile.update({
      where: { id: event.id },
      data: {
        status: "archived",
        isPublished: false,
        isActive: false,
      },
    });
  }
  throw new EventStudioActionError("Unsupported Event Studio action.");
}
