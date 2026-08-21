import { NextRequest, NextResponse } from "next/server";

import {
  audienceAllowedByPolicy,
  isClanReaction,
  isClanAudience,
  loadClanHallSnapshot,
  normalizeClanAudience,
  normalizeClanMessage,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { publishClanHallEvent } from "@/lib/clanHallEvents";
import { maybeCreateClanHallScribeReply } from "@/lib/clanHallScribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function normalizeSlug(value: string) {
  return decodeURIComponent(value).trim().toLowerCase().slice(0, 80);
}

function parseMessageId(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readSlug(context: { params: Promise<{ slug: string }> }) {
  const params = await context.params;
  return normalizeSlug(params.slug);
}

async function loadViewer(
  request: NextRequest,
  prisma: ReturnType<typeof getPrisma>
) {
  const uid = await getSessionUid(request);
  if (!uid) return null;

  return prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const slug = await readSlug(context);
    const viewerUid = await getSessionUid(request);
    const snapshot = await loadClanHallSnapshot(getPrisma(), slug, viewerUid);

    if (!snapshot) {
      return NextResponse.json(
        { detail: "Clan not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to load clan hall:", error);
    return NextResponse.json(
      { detail: "Clan hall is temporarily unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const slug = await readSlug(context);
    const prisma = getPrisma();
    const viewer = await loadViewer(request, prisma);
    if (!viewer) {
      return NextResponse.json(
        { detail: "Sign in with Steam to post in the clan hall." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const requestScribeReply =
      body.scribe === true;

    if (body.action === "toggle_reaction") {
      const messageId = parseMessageId(body.messageId);
      if (!messageId || !isClanReaction(body.emoji)) {
        return NextResponse.json(
          { detail: "Choose a valid clan reaction." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const current = await loadClanHallSnapshot(prisma, slug, viewer.uid);
      const visibleMessage = current?.messages.find(
        (entry) => entry.id === messageId
      );
      if (!current || !visibleMessage) {
        return NextResponse.json(
          { detail: "That clan message is not visible to you." },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const key = {
        messageId_userId_emoji: {
          messageId,
          userId: viewer.id,
          emoji: body.emoji,
        },
      };
      const existing = await prisma.clanMessageReaction.findUnique({
        where: key,
        select: { id: true },
      });
      if (existing) {
        await prisma.clanMessageReaction.delete({ where: key });
      } else {
        await prisma.clanMessageReaction.create({
          data: {
            messageId,
            userId: viewer.id,
            emoji: body.emoji,
          },
        });
      }

      publishClanHallEvent(slug, {
        type: "reaction",
        messageId,
      });

      const refreshed = await loadClanHallSnapshot(prisma, slug, viewer.uid);
      return NextResponse.json(refreshed, { headers: NO_STORE_HEADERS });
    }

    const message = normalizeClanMessage(body.message);
    if (!message) {
      return NextResponse.json(
        { detail: "Write a message before sending." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const clan = await prisma.clan.findFirst({
      where: {
        slug,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        chatAudiencePolicy: true,
      },
    });
    if (!clan) {
      return NextResponse.json(
        { detail: "Clan not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const membership = await prisma.clanMember.findUnique({
      where: {
        clanId_userId: {
          clanId: clan.id,
          userId: viewer.id,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });
    const isMember = membership?.status === "active" || viewer.isAdmin;
    if (!isClanAudience(body.audience)) {
      return NextResponse.json(
        { detail: "Choose a valid audience before posting." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const audience = body.audience;
    const policy = normalizeClanAudience(clan.chatAudiencePolicy, "public");

    if (!audienceAllowedByPolicy(audience, policy)) {
      return NextResponse.json(
        {
          detail:
            "That audience is broader than the clan's current chat policy.",
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }
    if (audience === "clan" && !isMember) {
      return NextResponse.json(
        { detail: "Clan-only posts are reserved for active clan members." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const recentMessage = await prisma.clanMessage.findFirst({
      where: {
        clanId: clan.id,
        authorUserId: viewer.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    if (
      recentMessage &&
      Date.now() - recentMessage.createdAt.getTime() < 3_000
    ) {
      return NextResponse.json(
        { detail: "Hold the line for a few seconds before posting again." },
        { status: 429, headers: NO_STORE_HEADERS }
      );
    }

    const createdMessage = await prisma.clanMessage.create({
      data: {
        clanId: clan.id,
        authorUserId: viewer.id,
        body: message,
        audience,
      },
      select: { id: true },
    });

    publishClanHallEvent(slug, {
      type: "message",
      messageId: createdMessage.id,
    });

    try {
      await maybeCreateClanHallScribeReply({
        prisma,
        clanId: clan.id,
        clanSlug: slug,
        clanName: clan.name,
        audience,
        triggerMessageId: createdMessage.id,
        message,
        forceReply: requestScribeReply,
        viewer: {
          uid: viewer.uid,
          displayName:
            viewer.inGameName || viewer.steamPersonaName || viewer.uid,
        },
      });
    } catch (hallScribeError) {
      console.warn(
        "Hall Scribe reply failed; human Hall message remains posted:",
        hallScribeError,
      );
    }

    const snapshot = await loadClanHallSnapshot(prisma, slug, viewer.uid);
    return NextResponse.json(snapshot, {
      status: 201,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Failed to post clan message:", error);
    return NextResponse.json(
      { detail: "Clan message could not be posted." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const slug = await readSlug(context);
    const prisma = getPrisma();
    const viewer = await loadViewer(request, prisma);
    if (!viewer) {
      return NextResponse.json(
        { detail: "Sign in to manage clan chat." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const current = await loadClanHallSnapshot(prisma, slug, viewer.uid);
    if (!current) {
      return NextResponse.json(
        { detail: "Clan not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (body.action === "edit_message") {
      const messageId = parseMessageId(body.messageId);
      const message = normalizeClanMessage(body.message);
      if (!messageId || !message) {
        return NextResponse.json(
          { detail: "A message and message id are required." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const targetMessage = current.messages.find(
        (entry) => entry.id === messageId
      );
      if (!targetMessage || !targetMessage.canEdit) {
        return NextResponse.json(
          { detail: "You can only edit messages under your command." },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      await prisma.clanMessage.updateMany({
        where: {
          id: messageId,
          clanId: current.clan.id,
        },
        data: { body: message },
      });

      publishClanHallEvent(slug, {
        type: "message_updated",
        messageId,
      });

      const refreshed = await loadClanHallSnapshot(prisma, slug, viewer.uid);
      return NextResponse.json(refreshed, { headers: NO_STORE_HEADERS });
    }

    if (!current.viewer.canManage) {
      return NextResponse.json(
        { detail: "Only clan admins can change the hall audience." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    if (!isClanAudience(body.chatAudiencePolicy)) {
      return NextResponse.json(
        { detail: "Choose a valid clan chat audience." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await prisma.clan.update({
      where: { id: current.clan.id },
      data: {
        chatAudiencePolicy: body.chatAudiencePolicy,
      },
    });

    publishClanHallEvent(slug, { type: "policy" });

    const refreshed = await loadClanHallSnapshot(prisma, slug, viewer.uid);
    return NextResponse.json(refreshed, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to update clan policy:", error);
    return NextResponse.json(
      { detail: "Clan chat policy could not be updated." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const slug = await readSlug(context);
    const prisma = getPrisma();
    const viewer = await loadViewer(request, prisma);
    if (!viewer) {
      return NextResponse.json(
        { detail: "Sign in to remove a clan message." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const messageId = parseMessageId(body.messageId);
    if (!messageId) {
      return NextResponse.json(
        { detail: "Message id is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const current = await loadClanHallSnapshot(prisma, slug, viewer.uid);
    const targetMessage = current?.messages.find(
      (entry) => entry.id === messageId
    );
    if (!current || !targetMessage || !targetMessage.canDelete) {
      return NextResponse.json(
        { detail: "You can only remove messages under your command." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    await prisma.clanMessage.deleteMany({
      where: {
        id: messageId,
        clanId: current.clan.id,
      },
    });

    publishClanHallEvent(slug, {
      type: "message_deleted",
      messageId,
    });

    const refreshed = await loadClanHallSnapshot(prisma, slug, viewer.uid);
    return NextResponse.json(refreshed, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to remove clan message:", error);
    return NextResponse.json(
      { detail: "Clan message could not be removed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
