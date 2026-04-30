import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import {
  EMPTY_BET_BROADCAST_PREVIEW_URLS,
  isBetBroadcastPreviewSlot,
  saveBetBroadcastPreviewUpload,
  type BetBroadcastPreviewUrls,
} from "@/lib/betBroadcastPreviews";
import { loadBetBoardSnapshot, type BetBroadcastFeeds } from "@/lib/bets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type BroadcastPreviewTarget = {
  id: string;
  kind: "market" | "result";
  title: string;
  eventLabel: string;
  sessionKey: string;
  playedAt: string | null;
  leftName: string;
  rightName: string;
  previewUrls: BetBroadcastPreviewUrls;
  feedSlots: Record<keyof BetBroadcastFeeds, boolean>;
};

function splitMatchTitle(title: string) {
  const [leftName, ...rightParts] = title.split(/\s+vs\s+/i);
  return {
    leftName: leftName?.trim() || "Player 1",
    rightName: rightParts.join(" vs ").trim() || "Player 2",
  };
}

function feedSlots(feeds: BetBroadcastFeeds) {
  return {
    left: Boolean(feeds.left),
    god: Boolean(feeds.god),
    right: Boolean(feeds.right),
  };
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const board = await loadBetBoardSnapshot(gate.prisma, gate.user.uid);
    const targets: BroadcastPreviewTarget[] = [
      ...board.openMarkets.map((market) => ({
        id: `market-${market.id}`,
        kind: "market" as const,
        title: market.title,
        eventLabel: market.eventLabel,
        sessionKey: market.linkedSessionKey || "",
        playedAt: market.scheduledStartAt,
        leftName: market.left.name || "Player 1",
        rightName: market.right.name || "Player 2",
        previewUrls: market.broadcastPreviewUrls ?? {
          ...EMPTY_BET_BROADCAST_PREVIEW_URLS,
        },
        feedSlots: feedSlots(market.broadcastFeeds),
      })),
      ...board.settledResults.map((result) => {
        const players = splitMatchTitle(result.title);
        return {
          id: `result-${result.id}`,
          kind: "result" as const,
          title: result.title,
          eventLabel: result.eventLabel,
          sessionKey: result.linkedSessionKey || "",
          playedAt: result.settledAt,
          leftName: players.leftName,
          rightName: players.rightName,
          previewUrls: result.broadcastPreviewUrls ?? {
            ...EMPTY_BET_BROADCAST_PREVIEW_URLS,
          },
          feedSlots: feedSlots(result.broadcastFeeds),
        };
      }),
    ].filter((target) => target.sessionKey.trim());

    return NextResponse.json({ targets }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not load Broadcast preview targets.",
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const slotValue = String(formData.get("slot") || "");
    const sessionKey = String(formData.get("sessionKey") || "");

    if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
      return NextResponse.json(
        { detail: "Choose an MP4 loop file first." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isBetBroadcastPreviewSlot(slotValue)) {
      return NextResponse.json(
        { detail: "Choose a valid Broadcast slot." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const entry = await saveBetBroadcastPreviewUpload({
      sessionKey,
      slot: slotValue,
      buffer: Buffer.from(await fileEntry.arrayBuffer()),
      originalName: fileEntry.name || null,
      mimeType: fileEntry.type || null,
      title: String(formData.get("title") || ""),
      eventLabel: String(formData.get("eventLabel") || ""),
      playedAt: String(formData.get("playedAt") || ""),
      uploadedByUid: gate.user.uid,
    });

    return NextResponse.json({ entry }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Could not save Broadcast preview loop.",
      },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
