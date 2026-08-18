import { NextRequest, NextResponse } from "next/server";

import { PAGE_CHANGE_NOTICES } from "@/lib/pageChangeNotices";
import {
  loadUserPageChangeState,
  markUserPageChangeSeen,
} from "@/lib/pageChangeServer";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

async function resolveViewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) return null;
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true, uid: true },
  });
  return user ? { prisma, user } : null;
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { ok: true, authenticated: false, notices: PAGE_CHANGE_NOTICES, unseen: [] },
        { headers: HEADERS }
      );
    }
    const state = await loadUserPageChangeState(resolved.prisma, resolved.user.id);
    return NextResponse.json(
      { ok: true, authenticated: true, notices: PAGE_CHANGE_NOTICES, unseen: state.unseen },
      { headers: HEADERS }
    );
  } catch (error) {
    console.error("Page-change state failed:", error);
    return NextResponse.json(
      { detail: "Page-change state is unavailable." },
      { status: 500, headers: HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveViewer(request);
    if (!resolved) {
      return NextResponse.json(
        { detail: "Sign in before recording page-change state." },
        { status: 401, headers: HEADERS }
      );
    }
    const body = (await request.json().catch(() => ({}))) as { href?: unknown };
    const href = typeof body.href === "string" ? body.href.trim() : "";
    if (!PAGE_CHANGE_NOTICES.some((notice) => notice.href === href)) {
      return NextResponse.json(
        { detail: "That page is not on the Kingdom change-notice rail." },
        { status: 400, headers: HEADERS }
      );
    }
    await markUserPageChangeSeen(resolved.prisma, resolved.user.id, href);
    const state = await loadUserPageChangeState(resolved.prisma, resolved.user.id);
    return NextResponse.json({ ok: true, unseen: state.unseen }, { headers: HEADERS });
  } catch (error) {
    console.error("Page-change seen update failed:", error);
    return NextResponse.json(
      { detail: "Page-change state could not be updated." },
      { status: 500, headers: HEADERS }
    );
  }
}
