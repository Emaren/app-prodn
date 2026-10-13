import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { translationControlSnapshot } from "@/lib/i18n/translationCatalogEvidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

/** Exact committed translation facts; no user messages, funds, or AI API keys. */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  return NextResponse.json(translationControlSnapshot(), { headers: HEADERS });
}
