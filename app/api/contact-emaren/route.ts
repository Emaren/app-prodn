import { NextRequest, NextResponse } from "next/server";

import {
  getOrCreateConversationByUsers,
  loadInboxPayload,
  normalizeInboxMessageBody,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  isAdmin: true,
  inGameName: true,
  steamPersonaName: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
    const targetUid = request.nextUrl.searchParams.get("user");
    const payload = await loadInboxPayload(prisma, sessionUid, {
      summaryOnly,
      targetUid,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load Contact Emaren inbox:", error);
    return NextResponse.json({ detail: "Inbox unavailable" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: VIEWER_SELECT,
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      body?: string;
      targetUid?: string;
    };

    const messageBody = normalizeInboxMessageBody(payload.body || "");
    if (messageBody.length < 1) {
      return NextResponse.json({ detail: "Message cannot be empty" }, { status: 400 });
    }

    let targetUser =
      viewer.isAdmin && payload.targetUid
        ? await prisma.user.findUnique({
            where: { uid: payload.targetUid },
            select: VIEWER_SELECT,
          })
        : null;

    if (!viewer.isAdmin) {
      targetUser = await resolvePrimaryAdminContact(prisma);
      if (!targetUser) {
        return NextResponse.json(
          { detail: "Emaren contact is not configured yet." },
          { status: 503 }
        );
      }
    }

    if (!targetUser) {
      return NextResponse.json({ detail: "Choose a user to message." }, { status: 400 });
    }

    if (targetUser.id === viewer.id) {
      return NextResponse.json({ detail: "You cannot message yourself." }, { status: 400 });
    }

    const conversation = await getOrCreateConversationByUsers(prisma, viewer.id, targetUser.id);

    await prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderUserId: viewer.id,
        body: messageBody,
      },
    });

    const now = new Date();
    await prisma.directConversation.update({
      where: { id: conversation.id },
      data: {
        updatedAt: now,
      },
    });

    await prisma.directConversationParticipant.updateMany({
      where: {
        conversationId: conversation.id,
        userId: viewer.id,
      },
      data: {
        lastReadAt: now,
      },
    });

    const refreshed = await loadInboxPayload(prisma, viewer.uid, {
      targetUid: targetUser.uid,
    });

    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to send Contact Emaren message:", error);
    return NextResponse.json({ detail: "Message failed." }, { status: 500 });
  }
}
