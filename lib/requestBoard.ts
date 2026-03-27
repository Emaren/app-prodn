import { PrismaClient } from "@/lib/generated/prisma";
import type {
  RequestBoardActor,
  RequestBoardComment,
  RequestBoardItem,
  RequestBoardSnapshot,
} from "@/lib/requestBoardTypes";

const USER_SELECT = {
  id: true,
  uid: true,
  isAdmin: true,
  inGameName: true,
  steamPersonaName: true,
} as const;

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function toActor(user: {
  uid: string;
  isAdmin: boolean;
  inGameName: string | null;
  steamPersonaName: string | null;
}): RequestBoardActor {
  return {
    uid: user.uid,
    displayName: displayName(user),
    isAdmin: user.isAdmin,
  };
}

type ViewerRow = {
  id: number;
  uid: string;
  isAdmin: boolean;
  inGameName: string | null;
  steamPersonaName: string | null;
} | null;

function canManageAuthorOwnedEntity(
  viewer: ViewerRow,
  authorUserId: number
) {
  if (!viewer) return false;
  return viewer.isAdmin || viewer.id === authorUserId;
}

function mapComment(
  comment: {
    id: number;
    parentId: number | null;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    authorUserId: number;
    author: {
      uid: string;
      isAdmin: boolean;
      inGameName: string | null;
      steamPersonaName: string | null;
    };
    replies: Array<{
      id: number;
      parentId: number | null;
      body: string;
      createdAt: Date;
      updatedAt: Date;
      authorUserId: number;
      author: {
        uid: string;
        isAdmin: boolean;
        inGameName: string | null;
        steamPersonaName: string | null;
      };
    }>;
  },
  viewer: ViewerRow
): RequestBoardComment {
  return {
    id: comment.id,
    parentId: comment.parentId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: toActor(comment.author),
    canEdit: canManageAuthorOwnedEntity(viewer, comment.authorUserId),
    canDelete: canManageAuthorOwnedEntity(viewer, comment.authorUserId),
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      parentId: reply.parentId,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
      updatedAt: reply.updatedAt.toISOString(),
      author: toActor(reply.author),
      canEdit: canManageAuthorOwnedEntity(viewer, reply.authorUserId),
      canDelete: canManageAuthorOwnedEntity(viewer, reply.authorUserId),
      replies: [],
    })),
  };
}

function mapRequest(
  request: {
    id: number;
    title: string;
    body: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    createdByUserId: number;
    author: {
      uid: string;
      isAdmin: boolean;
      inGameName: string | null;
      steamPersonaName: string | null;
    };
    completedBy: {
      uid: string;
      isAdmin: boolean;
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
    votes: Array<{
      userId: number;
      value: number;
    }>;
    comments: Array<{
      id: number;
      parentId: number | null;
      body: string;
      createdAt: Date;
      updatedAt: Date;
      authorUserId: number;
      author: {
        uid: string;
        isAdmin: boolean;
        inGameName: string | null;
        steamPersonaName: string | null;
      };
      replies: Array<{
        id: number;
        parentId: number | null;
        body: string;
        createdAt: Date;
        updatedAt: Date;
        authorUserId: number;
        author: {
          uid: string;
          isAdmin: boolean;
          inGameName: string | null;
          steamPersonaName: string | null;
        };
      }>;
    }>;
  },
  viewer: ViewerRow
): RequestBoardItem {
  const score = request.votes.reduce((sum, vote) => sum + vote.value, 0);
  const viewerVote = (viewer
    ? request.votes.find((vote) => vote.userId === viewer.id)?.value ?? 0
    : 0) as -1 | 0 | 1;
  const comments = request.comments.map((comment) => mapComment(comment, viewer));
  const commentCount = comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0);
  const viewerCanManage = canManageAuthorOwnedEntity(viewer, request.createdByUserId);

  return {
    id: request.id,
    title: request.title,
    body: request.body,
    status: request.status === "completed" ? "completed" : "open",
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    completedAt: request.completedAt ? request.completedAt.toISOString() : null,
    author: toActor(request.author),
    completedBy: request.completedBy ? toActor(request.completedBy) : null,
    score,
    voteCount: request.votes.length,
    viewerVote,
    commentCount,
    canEdit: viewerCanManage,
    canDelete: viewerCanManage,
    canComplete: Boolean(viewer?.isAdmin),
    comments,
  };
}

export function normalizeRequestTitle(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

export function normalizeRequestBody(value: string) {
  return value.trim().slice(0, 5_000);
}

export async function getRequestBoardSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<RequestBoardSnapshot> {
  const viewer = viewerUid
    ? await prisma.user.findUnique({
        where: { uid: viewerUid },
        select: USER_SELECT,
      })
    : null;

  const requests = await prisma.communityRequest.findMany({
    include: {
      author: { select: USER_SELECT },
      completedBy: { select: USER_SELECT },
      votes: {
        select: {
          userId: true,
          value: true,
        },
      },
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: USER_SELECT },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: USER_SELECT },
            },
          },
        },
      },
    },
  });

  const mapped = requests.map((request) => mapRequest(request, viewer));
  const items = mapped
    .filter((request) => request.status === "open")
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
  const completedItems = mapped
    .filter((request) => request.status === "completed")
    .sort((left, right) => {
      return new Date(right.completedAt || right.updatedAt).getTime() - new Date(left.completedAt || left.updatedAt).getTime();
    });

  return {
    viewer: viewer ? toActor(viewer) : null,
    openCount: items.length,
    completedCount: completedItems.length,
    items,
    completedItems,
  };
}
