import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  loadAdminWorkshop,
  normalizeWorkshopDialogue,
  WORKSHOP_ACTIVITY_MODES,
  WORKSHOP_ENTRY_TYPES,
  WORKSHOP_LANES,
  WORKSHOP_STREAM_STATUSES,
} from "@/lib/workshop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, max) || fallback : fallback;
}

function multiline(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

function integer(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function date(value: unknown) {
  const candidate = text(value, 80);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeUrl(value: unknown) {
  const candidate = text(value, 1_000);
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function choice<T extends readonly string[]>(value: unknown, choices: T, fallback: T[number]) {
  const candidate = text(value, 40);
  return choices.includes(candidate as T[number]) ? (candidate as T[number]) : fallback;
}

function entryData(body: Record<string, unknown>, uid: string, existingPublishedAt?: Date | null) {
  const status = choice(body.status, ["draft", "published", "archived"] as const, "draft");
  const visibility = choice(body.visibility, ["private", "public"] as const, "private");
  const publicPublication = status === "published" && visibility === "public";
  return {
    entryType: choice(body.entryType, WORKSHOP_ENTRY_TYPES, "build_note"),
    title: text(body.title, 200, "Untitled Workshop note"),
    summary: text(body.summary, 500),
    body: multiline(body.body, 30_000),
    dialogue: normalizeWorkshopDialogue(body.dialogue),
    lane: choice(body.lane, WORKSHOP_LANES, "work_feed"),
    status,
    visibility,
    mediaKind: text(body.mediaKind, 32) || null,
    mediaUrl: safeUrl(body.mediaUrl),
    mediaAlt: text(body.mediaAlt, 220) || null,
    linkLabel: text(body.linkLabel, 100) || null,
    linkUrl: safeUrl(body.linkUrl),
    pinned: body.pinned === true,
    featuredOrder: Math.max(-10_000, Math.min(10_000, integer(body.featuredOrder))),
    occurredAt: date(body.occurredAt) ?? new Date(),
    publishedAt: publicPublication ? existingPublishedAt ?? new Date() : null,
    updatedByUid: uid,
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  return NextResponse.json(await loadAdminWorkshop(gate.prisma), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = text(body.kind, 24, "entry");

  if (kind === "stream") {
    const isPublic = body.isPublic === true;
    const status = choice(body.status, WORKSHOP_STREAM_STATUSES, "draft");
    if (status === "live" && !isPublic) {
      return NextResponse.json({ detail: "A live Workshop stream must be explicitly public." }, { status: 400 });
    }
    const now = new Date();
    const stream = await gate.prisma.$transaction(async (tx) => {
      if (status === "live") {
        await tx.workshopStream.updateMany({
          where: { status: "live" },
          data: { status: "ended", endedAt: now },
        });
      }
      const created = await tx.workshopStream.create({
        data: {
          provider: text(body.provider, 40, "first_party"),
          sourceType: choice(body.sourceType, ["first_party", "external", "recorded", "screen_share"] as const, "external"),
          title: text(body.title, 200, "Workshop stream"),
          description: multiline(body.description, 10_000),
          playbackUrl: safeUrl(body.playbackUrl),
          embedUrl: safeUrl(body.embedUrl),
          thumbnailUrl: safeUrl(body.thumbnailUrl),
          status,
          isPublic,
          createdByUid: gate.user.uid,
          startedAt: status === "live" ? now : date(body.startedAt),
        },
      });
      if (status === "live") {
        await tx.workshopStatus.upsert({
          where: { id: 1 },
          create: {
            id: 1,
            isOpen: true,
            isLive: true,
            activityMode: "streaming",
            headline: "THE WORKSHOP IS OPEN",
            description: "A deliberately configured live signal is active from the AoE2WAR Workshop.",
            currentProject: created.title,
            activeStreamId: created.id,
            updatedByUid: gate.user.uid,
            openedAt: now,
          },
          update: {
            isOpen: true,
            isLive: true,
            activityMode: "streaming",
            activeStreamId: created.id,
            updatedByUid: gate.user.uid,
          },
        });
      }
      return created;
    });
    return NextResponse.json({ ok: true, stream }, { status: 201 });
  }

  const entry = await gate.prisma.workshopEntry.create({
    data: { ...entryData(body, gate.user.uid), createdByUid: gate.user.uid },
  });
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = text(body.kind, 24, "status");

  if (kind === "status") {
    const isOpen = body.isOpen === true;
    const isLive = isOpen && body.isLive === true;
    const activityMode = isOpen
      ? choice(body.activityMode, WORKSHOP_ACTIVITY_MODES, "quiet_work")
      : "closed";
    const existing = await gate.prisma.workshopStatus.findUnique({
      where: { id: 1 },
      select: { isOpen: true, openedAt: true, activeStreamId: true },
    });
    if (existing?.activeStreamId && (!isOpen || !isLive || activityMode !== "streaming")) {
      return NextResponse.json(
        { detail: "End or hide the active Workshop stream before changing its live signal." },
        { status: 409 }
      );
    }
    const openedAt = isOpen
      ? existing?.isOpen
        ? existing.openedAt ?? new Date()
        : new Date()
      : null;
    const status = await gate.prisma.workshopStatus.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        isOpen,
        isLive,
        activityMode,
        headline: text(body.headline, 160, isOpen ? "THE WORKSHOP IS OPEN" : "THE WORKSHOP RESTS"),
        description: multiline(body.description, 8_000),
        currentProject: text(body.currentProject, 160) || null,
        activeStreamId: existing?.activeStreamId ?? null,
        updatedByUid: gate.user.uid,
        openedAt,
      },
      update: {
        isOpen,
        isLive,
        activityMode,
        headline: text(body.headline, 160, isOpen ? "THE WORKSHOP IS OPEN" : "THE WORKSHOP RESTS"),
        description: multiline(body.description, 8_000),
        currentProject: text(body.currentProject, 160) || null,
        activeStreamId: existing?.activeStreamId ?? null,
        updatedByUid: gate.user.uid,
        openedAt,
      },
    });
    return NextResponse.json({ ok: true, status });
  }

  const id = integer(body.id);
  if (!id) return NextResponse.json({ detail: "A valid record id is required." }, { status: 400 });

  if (kind === "stream") {
    const isPublic = body.isPublic === true;
    const status = choice(body.status, WORKSHOP_STREAM_STATUSES, "draft");
    if (status === "live" && !isPublic) {
      return NextResponse.json({ detail: "A live Workshop stream must be explicitly public." }, { status: 400 });
    }
    const now = new Date();
    const stream = await gate.prisma.$transaction(async (tx) => {
      if (status === "live") {
        await tx.workshopStream.updateMany({
          where: { status: "live", id: { not: id } },
          data: { status: "ended", endedAt: now },
        });
      }
      const updated = await tx.workshopStream.update({
        where: { id },
        data: {
          provider: text(body.provider, 40, "first_party"),
          sourceType: choice(body.sourceType, ["first_party", "external", "recorded", "screen_share"] as const, "external"),
          title: text(body.title, 200, "Workshop stream"),
          description: multiline(body.description, 10_000),
          playbackUrl: safeUrl(body.playbackUrl),
          embedUrl: safeUrl(body.embedUrl),
          thumbnailUrl: safeUrl(body.thumbnailUrl),
          status,
          isPublic,
          startedAt: status === "live" ? date(body.startedAt) ?? now : date(body.startedAt),
          endedAt: status === "ended" ? date(body.endedAt) ?? now : null,
        },
      });
      if (status === "live") {
        await tx.workshopStatus.upsert({
          where: { id: 1 },
          create: {
            id: 1,
            isOpen: true,
            isLive: true,
            activityMode: "streaming",
            headline: "THE WORKSHOP IS OPEN",
            description: "A deliberately configured live signal is active from the AoE2WAR Workshop.",
            currentProject: updated.title,
            activeStreamId: updated.id,
            updatedByUid: gate.user.uid,
            openedAt: now,
          },
          update: {
            isOpen: true,
            isLive: true,
            activityMode: "streaming",
            activeStreamId: updated.id,
            updatedByUid: gate.user.uid,
          },
        });
      } else {
        await tx.workshopStatus.updateMany({
          where: { id: 1, activeStreamId: id },
          data: {
            isLive: false,
            activityMode: "quiet_work",
            activeStreamId: null,
            updatedByUid: gate.user.uid,
          },
        });
      }
      return updated;
    });
    return NextResponse.json({ ok: true, stream });
  }

  const existing = await gate.prisma.workshopEntry.findUnique({ where: { id }, select: { publishedAt: true } });
  if (!existing) return NextResponse.json({ detail: "Workshop entry not found." }, { status: 404 });
  const entry = await gate.prisma.workshopEntry.update({
    where: { id },
    data: entryData(body, gate.user.uid, existing.publishedAt),
  });
  return NextResponse.json({ ok: true, entry });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  const id = integer(request.nextUrl.searchParams.get("id"));
  const kind = text(request.nextUrl.searchParams.get("kind"), 24, "entry");
  if (!id) return NextResponse.json({ detail: "A valid record id is required." }, { status: 400 });
  if (kind === "stream") {
    await gate.prisma.$transaction(async (tx) => {
      await tx.workshopStatus.updateMany({
        where: { id: 1, activeStreamId: id },
        data: {
          isLive: false,
          activityMode: "quiet_work",
          activeStreamId: null,
          updatedByUid: gate.user.uid,
        },
      });
      await tx.workshopStream.delete({ where: { id } });
    });
  } else await gate.prisma.workshopEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
