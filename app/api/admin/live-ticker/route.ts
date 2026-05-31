import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import type { PrismaClient } from "@/lib/generated/prisma";
import {
  LIVE_TICKER_MESSAGE_MAX_CHARS,
  loadAdminLiveTickerMessages,
  normalizeLiveTickerText,
} from "@/lib/liveTicker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function parseId(value: unknown) {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePriority(value: unknown) {
  const priority =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(priority) ? Math.max(-100, Math.min(100, Math.trunc(priority))) : 0;
}

function parseExpiresAt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed;
}

async function tickerResponse(prisma: PrismaClient) {
  const messages = await loadAdminLiveTickerMessages(prisma);
  return NextResponse.json({ messages }, { headers: NO_STORE_HEADERS });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  return tickerResponse(admin.prisma);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = normalizeLiveTickerText(body.text);
  const expiresAt = parseExpiresAt(body.expiresAt);

  if (text.length < 3) {
    return NextResponse.json(
      { detail: "Ticker message must be at least 3 characters." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (text.length > LIVE_TICKER_MESSAGE_MAX_CHARS) {
    return NextResponse.json(
      { detail: `Ticker message must be ${LIVE_TICKER_MESSAGE_MAX_CHARS} characters or less.` },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  if (expiresAt === "invalid") {
    return NextResponse.json(
      { detail: "Invalid expiration date." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  await admin.prisma.liveTickerMessage.create({
    data: {
      text,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      priority: parsePriority(body.priority),
      expiresAt,
    },
  });

  return tickerResponse(admin.prisma);
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ("error" in admin) return admin.error;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = parseId(body.id);

  if (!id) {
    return NextResponse.json(
      { detail: "Ticker message id is required." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const data: {
    text?: string;
    enabled?: boolean;
    priority?: number;
    expiresAt?: Date | null;
  } = {};

  if ("text" in body) {
    const text = normalizeLiveTickerText(body.text);
    if (text.length < 3) {
      return NextResponse.json(
        { detail: "Ticker message must be at least 3 characters." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    data.text = text;
  }

  if ("enabled" in body) {
    data.enabled = Boolean(body.enabled);
  }

  if ("priority" in body) {
    data.priority = parsePriority(body.priority);
  }

  if ("expiresAt" in body) {
    const expiresAt = parseExpiresAt(body.expiresAt);
    if (expiresAt === "invalid") {
      return NextResponse.json(
        { detail: "Invalid expiration date." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    data.expiresAt = expiresAt;
  }

  const updated = await admin.prisma.liveTickerMessage.updateMany({
    where: { id },
    data,
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { detail: "Ticker message not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  return tickerResponse(admin.prisma);
}
