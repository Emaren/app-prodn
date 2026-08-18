import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { PAGE_CHANGE_NOTICES } from "@/lib/pageChangeNotices";
import { bumpPageChangeContentRevision } from "@/lib/pageChangeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  const body = (await request.json().catch(() => ({}))) as {
    href?: unknown;
    reason?: unknown;
  };
  const href = typeof body.href === "string" ? body.href.trim() : "";
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "Meaningful content updated";

  if (!PAGE_CHANGE_NOTICES.some((notice) => notice.href === href)) {
    return NextResponse.json(
      { detail: "That page is not on the Kingdom change-notice rail." },
      { status: 400 }
    );
  }

  const revision = await bumpPageChangeContentRevision(gate.prisma, href, reason);
  return NextResponse.json({
    ok: true,
    href: revision.href,
    sourceVersion: revision.sourceVersion,
    contentRevision: revision.contentRevision,
    changedAt: revision.changedAt.toISOString(),
  });
}
