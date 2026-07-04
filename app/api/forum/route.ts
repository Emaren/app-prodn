import { NextRequest, NextResponse } from "next/server";

import {
  buildForumFallbackSnapshot,
  buildForumSlug,
  FORUM_CHANNELS,
  isForumChannel,
  isForumReaction,
  loadForumSnapshot,
  normalizeForumBody,
  normalizeForumExcerpt,
  normalizeForumTitle,
} from "@/lib/forum";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function isMissingForumTableError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2021"
  );
}

function parseThreadId(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return {
      error: NextResponse.json(
        { detail: "Sign in with Steam to write in the War Room." },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      isAdmin: true,
    },
  });

  if (!viewer) {
    return {
      error: NextResponse.json(
        { detail: "Your AoE2WAR citizen record could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { prisma, viewer };
}

export async function GET(request: NextRequest) {
  try {
    const viewerUid = await getSessionUid(request);
    const snapshot = await loadForumSnapshot(getPrisma(), viewerUid);
    return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (isMissingForumTableError(error)) {
      return NextResponse.json(buildForumFallbackSnapshot(), {
        headers: {
          ...NO_STORE_HEADERS,
          "X-AoE2WAR-Forum-Ledger": "migration-required",
        },
      });
    }
    console.error("Failed to load War Room forum:", error);
    return NextResponse.json(
      { detail: "The War Room ledger is temporarily unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = String(payload.action || "");
    let createdSlug: string | null = null;

    if (action === "create_thread") {
      const channel = isForumChannel(payload.channel)
        ? payload.channel
        : "wolo-chronicles";
      const title = normalizeForumTitle(payload.title);
      const body = normalizeForumBody(payload.body);
      const excerpt =
        normalizeForumExcerpt(payload.excerpt) ||
        normalizeForumExcerpt(body.split(/\n\s*\n/)[0]);

      if (title.length < 6) {
        return NextResponse.json(
          { detail: "Give the dispatch a title with at least six characters." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (body.length < 20) {
        return NextResponse.json(
          { detail: "Give the room enough detail to answer—at least twenty characters." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const latest = await prisma.forumThread.findFirst({
        where: { authorUserId: viewer.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 10_000) {
        return NextResponse.json(
          { detail: "Hold the line for a few seconds before opening another thread." },
          { status: 429, headers: NO_STORE_HEADERS }
        );
      }

      const channelDetail = FORUM_CHANNELS.find((entry) => entry.key === channel);
      createdSlug = buildForumSlug(title);
      await prisma.forumThread.create({
        data: {
          slug: createdSlug,
          channel,
          tag: channelDetail?.shortLabel || "Community",
          title,
          excerpt,
          body,
          authorUserId: viewer.id,
          authorRole: "AoE2WAR citizen",
        },
      });
    } else if (action === "update_thread") {
      if (!viewer.isAdmin) {
        return NextResponse.json(
          { detail: "Only AoE2WAR stewards can edit War Room dispatches." },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }

      const threadId = parseThreadId(payload.threadId);
      const title = normalizeForumTitle(payload.title);
      const excerpt = normalizeForumExcerpt(payload.excerpt);
      const body = normalizeForumBody(payload.body);
      const channel = isForumChannel(payload.channel) ? payload.channel : null;
      const requestedTag = normalizeForumTitle(payload.tag).slice(0, 48);

      if (!threadId) {
        return NextResponse.json(
          { detail: "Choose a real thread before editing." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (title.length < 6) {
        return NextResponse.json(
          { detail: "Give the dispatch a title with at least six characters." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (excerpt.length < 12) {
        return NextResponse.json(
          { detail: "Give the dispatch a short deck/excerpt." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (body.length < 20) {
        return NextResponse.json(
          { detail: "Give the dispatch body at least twenty characters." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const existing = await prisma.forumThread.findUnique({
        where: { id: threadId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json(
          { detail: "That dispatch could not be found." },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }

      const channelDetail = channel
        ? FORUM_CHANNELS.find((entry) => entry.key === channel)
        : null;

      await prisma.forumThread.update({
        where: { id: threadId },
        data: {
          title,
          excerpt,
          body,
          ...(channel
            ? {
                channel,
                tag: requestedTag || channelDetail?.shortLabel || "Community",
              }
            : requestedTag
              ? { tag: requestedTag }
              : {}),
          isPinned:
            typeof payload.isPinned === "boolean" ? payload.isPinned : undefined,
          isFeatured:
            typeof payload.isFeatured === "boolean" ? payload.isFeatured : undefined,
          isHot:
            typeof payload.isHot === "boolean" ? payload.isHot : undefined,
          isLocked:
            typeof payload.isLocked === "boolean" ? payload.isLocked : undefined,
          updatedAt: new Date(),
        },
      });
    } else if (action === "reply") {
      const threadId = parseThreadId(payload.threadId);
      const body = normalizeForumBody(payload.body);
      if (!threadId) {
        return NextResponse.json(
          { detail: "Choose a real thread before replying." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (body.length < 2) {
        return NextResponse.json(
          { detail: "Write a reply before sending it into the room." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const thread = await prisma.forumThread.findUnique({
        where: { id: threadId },
        select: { id: true, isLocked: true },
      });
      if (!thread) {
        return NextResponse.json(
          { detail: "That thread could not be found." },
          { status: 404, headers: NO_STORE_HEADERS }
        );
      }
      if (thread.isLocked) {
        return NextResponse.json(
          { detail: "That dispatch has been sealed by the stewards." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      const latest = await prisma.forumPost.findFirst({
        where: { authorUserId: viewer.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { createdAt: true },
      });
      if (latest && Date.now() - latest.createdAt.getTime() < 3_000) {
        return NextResponse.json(
          { detail: "Give the other scouts three seconds to catch up." },
          { status: 429, headers: NO_STORE_HEADERS }
        );
      }

      await prisma.$transaction([
        prisma.forumPost.create({
          data: {
            threadId,
            authorUserId: viewer.id,
            authorRole: "AoE2WAR citizen",
            body,
          },
        }),
        prisma.forumThread.update({
          where: { id: threadId },
          data: { updatedAt: new Date() },
        }),
      ]);
    } else if (action === "toggle_bookmark") {
      const threadId = parseThreadId(payload.threadId);
      if (!threadId) {
        return NextResponse.json(
          { detail: "Choose a real thread to bookmark." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const key = {
        threadId_userId: {
          threadId,
          userId: viewer.id,
        },
      };
      const existing = await prisma.forumThreadBookmark.findUnique({
        where: key,
        select: { id: true },
      });
      if (existing) {
        await prisma.forumThreadBookmark.delete({ where: key });
      } else {
        await prisma.forumThreadBookmark.create({
          data: { threadId, userId: viewer.id },
        });
      }
    } else if (action === "toggle_reaction") {
      const threadId = parseThreadId(payload.threadId);
      if (!threadId || !isForumReaction(payload.emoji)) {
        return NextResponse.json(
          { detail: "Choose a real thread and a War Room reaction." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const key = {
        threadId_userId_emoji: {
          threadId,
          userId: viewer.id,
          emoji: payload.emoji,
        },
      };
      const existing = await prisma.forumThreadReaction.findUnique({
        where: key,
        select: { id: true },
      });
      if (existing) {
        await prisma.forumThreadReaction.delete({ where: key });
      } else {
        await prisma.forumThreadReaction.create({
          data: {
            threadId,
            userId: viewer.id,
            emoji: payload.emoji,
          },
        });
      }
    } else {
      return NextResponse.json(
        { detail: "That War Room action is not supported." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const snapshot = await loadForumSnapshot(prisma, viewer.uid);
    return NextResponse.json(
      {
        ...snapshot,
        createdSlug,
      },
      { status: action === "create_thread" ? 201 : 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to update War Room forum:", error);
    return NextResponse.json(
      { detail: "The War Room could not record that action." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const threadId = parseThreadId(payload.threadId);
    if (payload.action !== "record_view" || !threadId) {
      return NextResponse.json(
        { detail: "Choose a real thread to record." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    await getPrisma().forumThread.update({
      where: { id: threadId },
      data: {
        viewCount: { increment: 1 },
      },
      select: { id: true },
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Failed to record War Room thread view:", error);
    return NextResponse.json(
      { detail: "Thread view was not recorded." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
