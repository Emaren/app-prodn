import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  getRequestBoardSnapshot,
  normalizeRequestBody,
  normalizeRequestTitle,
} from "@/lib/requestBoard";
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

async function requireViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    return { error: NextResponse.json({ detail: "No active session" }, { status: 401 }) };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: VIEWER_SELECT,
  });

  if (!viewer) {
    return { error: NextResponse.json({ detail: "Viewer not found" }, { status: 404 }) };
  }

  return { prisma, viewer };
}

function canManage(viewer: { id: number; isAdmin: boolean }, ownerUserId: number) {
  return viewer.isAdmin || viewer.id === ownerUserId;
}

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    const prisma = getPrisma();

    if (request.nextUrl.searchParams.get("summary") === "1") {
      const openCount = await prisma.communityRequest.count({
        where: { status: "open" },
      });
      return NextResponse.json({ openCount });
    }

    const payload = await getRequestBoardSnapshot(prisma, sessionUid);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load request board:", error);
    return NextResponse.json({ detail: "Request board unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as {
      kind?: string;
      title?: string;
      body?: string;
      requestId?: number;
      parentId?: number | null;
    };

    if (payload.kind === "comment") {
      const body = normalizeRequestBody(payload.body || "");
      if (!body) {
        return NextResponse.json({ detail: "Comment cannot be empty." }, { status: 400 });
      }
      if (typeof payload.requestId !== "number") {
        return NextResponse.json({ detail: "Request id is required." }, { status: 400 });
      }

      const targetRequest = await prisma.communityRequest.findUnique({
        where: { id: payload.requestId },
        select: { id: true },
      });

      if (!targetRequest) {
        return NextResponse.json({ detail: "Request not found." }, { status: 404 });
      }

      let parentId: number | null = null;
      if (typeof payload.parentId === "number") {
        const parent = await prisma.communityRequestComment.findFirst({
          where: {
            id: payload.parentId,
            requestId: payload.requestId,
          },
          select: { id: true, parentId: true },
        });
        if (!parent) {
          return NextResponse.json({ detail: "Reply target not found." }, { status: 404 });
        }
        parentId = parent.parentId ?? parent.id;
      }

      await prisma.communityRequestComment.create({
        data: {
          requestId: payload.requestId,
          authorUserId: viewer.id,
          parentId,
          body,
        },
      });

      const refreshed = await getRequestBoardSnapshot(prisma, viewer.uid);
      return NextResponse.json(refreshed);
    }

    const title = normalizeRequestTitle(payload.title || "");
    const body = normalizeRequestBody(payload.body || "");
    if (!title) {
      return NextResponse.json({ detail: "A request title is required." }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ detail: "Tell the community what should change." }, { status: 400 });
    }

    await prisma.communityRequest.create({
      data: {
        title,
        body,
        createdByUserId: viewer.id,
      },
    });

    const refreshed = await getRequestBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to create request board item:", error);
    const detail = error instanceof Error ? error.message : "Request action failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      requestId?: number;
      commentId?: number;
      title?: string;
      body?: string;
      value?: number;
      status?: string;
    };

    switch (payload.action) {
      case "vote": {
        if (typeof payload.requestId !== "number") {
          return NextResponse.json({ detail: "Request id is required." }, { status: 400 });
        }

        const target = await prisma.communityRequest.findUnique({
          where: { id: payload.requestId },
          select: { id: true },
        });
        if (!target) {
          return NextResponse.json({ detail: "Request not found." }, { status: 404 });
        }

        const value = payload.value === -1 ? -1 : payload.value === 1 ? 1 : 0;
        if (value === 0) {
          await prisma.communityRequestVote.deleteMany({
            where: {
              requestId: payload.requestId,
              userId: viewer.id,
            },
          });
        } else {
          await prisma.communityRequestVote.upsert({
            where: {
              requestId_userId: {
                requestId: payload.requestId,
                userId: viewer.id,
              },
            },
            update: { value },
            create: {
              requestId: payload.requestId,
              userId: viewer.id,
              value,
            },
          });
        }
        break;
      }

      case "edit_request": {
        if (typeof payload.requestId !== "number") {
          return NextResponse.json({ detail: "Request id is required." }, { status: 400 });
        }
        const target = await prisma.communityRequest.findUnique({
          where: { id: payload.requestId },
          select: {
            id: true,
            createdByUserId: true,
          },
        });
        if (!target) {
          return NextResponse.json({ detail: "Request not found." }, { status: 404 });
        }
        if (!canManage(viewer, target.createdByUserId)) {
          return NextResponse.json({ detail: "Forbidden." }, { status: 403 });
        }

        const title = normalizeRequestTitle(payload.title || "");
        const body = normalizeRequestBody(payload.body || "");
        if (!title || !body) {
          return NextResponse.json({ detail: "Title and body are required." }, { status: 400 });
        }

        await prisma.communityRequest.update({
          where: { id: payload.requestId },
          data: {
            title,
            body,
          },
        });
        break;
      }

      case "set_status": {
        if (typeof payload.requestId !== "number") {
          return NextResponse.json({ detail: "Request id is required." }, { status: 400 });
        }
        if (!viewer.isAdmin) {
          return NextResponse.json({ detail: "Forbidden." }, { status: 403 });
        }

        const nextStatus = payload.status === "completed" ? "completed" : "open";
        await prisma.communityRequest.update({
          where: { id: payload.requestId },
          data:
            nextStatus === "completed"
              ? {
                  status: nextStatus,
                  completedAt: new Date(),
                  completedByUserId: viewer.id,
                }
              : {
                  status: nextStatus,
                  completedAt: null,
                  completedByUserId: null,
                },
        });
        break;
      }

      case "edit_comment": {
        if (typeof payload.commentId !== "number") {
          return NextResponse.json({ detail: "Comment id is required." }, { status: 400 });
        }
        const target = await prisma.communityRequestComment.findUnique({
          where: { id: payload.commentId },
          select: {
            id: true,
            authorUserId: true,
          },
        });
        if (!target) {
          return NextResponse.json({ detail: "Comment not found." }, { status: 404 });
        }
        if (!canManage(viewer, target.authorUserId)) {
          return NextResponse.json({ detail: "Forbidden." }, { status: 403 });
        }

        const body = normalizeRequestBody(payload.body || "");
        if (!body) {
          return NextResponse.json({ detail: "Comment cannot be empty." }, { status: 400 });
        }

        await prisma.communityRequestComment.update({
          where: { id: payload.commentId },
          data: { body },
        });
        break;
      }

      default:
        return NextResponse.json({ detail: "Unsupported action." }, { status: 400 });
    }

    const refreshed = await getRequestBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update request board:", error);
    const detail = error instanceof Error ? error.message : "Request action failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as {
      requestId?: number;
      commentId?: number;
    };

    if (typeof payload.requestId === "number") {
      const target = await prisma.communityRequest.findUnique({
        where: { id: payload.requestId },
        select: {
          id: true,
          createdByUserId: true,
        },
      });
      if (!target) {
        return NextResponse.json({ detail: "Request not found." }, { status: 404 });
      }
      if (!canManage(viewer, target.createdByUserId)) {
        return NextResponse.json({ detail: "Forbidden." }, { status: 403 });
      }

      await prisma.communityRequest.delete({
        where: { id: payload.requestId },
      });
    } else if (typeof payload.commentId === "number") {
      const target = await prisma.communityRequestComment.findUnique({
        where: { id: payload.commentId },
        select: {
          id: true,
          authorUserId: true,
        },
      });
      if (!target) {
        return NextResponse.json({ detail: "Comment not found." }, { status: 404 });
      }
      if (!canManage(viewer, target.authorUserId)) {
        return NextResponse.json({ detail: "Forbidden." }, { status: 403 });
      }

      await prisma.communityRequestComment.delete({
        where: { id: payload.commentId },
      });
    } else {
      return NextResponse.json({ detail: "Nothing to delete." }, { status: 400 });
    }

    const refreshed = await getRequestBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to delete request board content:", error);
    const detail = error instanceof Error ? error.message : "Delete failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
