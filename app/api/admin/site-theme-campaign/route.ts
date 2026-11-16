import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { getPrisma } from "@/lib/prisma";
import { NOVEMBER_2026_CAMPAIGN } from "@/lib/novemberThemeCampaign";
import { loadSiteThemeCampaignAdminState } from "@/lib/siteThemeCampaign";
import {
  callAppearanceWriter,
  readBoundedAppearanceJson,
  signedAppearanceCookie,
  validateAppearanceWriteOrigin,
} from "@/lib/appearanceWriterClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  try {
    // Source-only, least-privilege web SELECT read model. C03 will grant only
    // approved presentation columns; requireAdmin's C03 legacy-data proxy is
    // intentionally not a Prisma data handle.
    const data = await loadSiteThemeCampaignAdminState(getPrisma());
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch {
    return NextResponse.json(
      { detail: "Campaign read model is not admitted." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;
  if (!validateAppearanceWriteOrigin(request)) {
    return NextResponse.json(
      { detail: "Same-origin request required." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }
  const signedSession = signedAppearanceCookie(request);
  if (!signedSession) {
    return NextResponse.json(
      { detail: "Signed session required." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  let input: unknown;
  try { input = await readBoundedAppearanceJson(request); }
  catch {
    return NextResponse.json(
      { detail: "Invalid appearance request." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return NextResponse.json(
      { detail: "Invalid campaign action." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  const body = input as Record<string, unknown>;
  let action: Record<string, unknown>;
  if (Object.keys(body).length === 1 &&
      body.campaignKey === NOVEMBER_2026_CAMPAIGN.campaignKey) {
    action = { action: "activateNovember" };
  } else if (Object.keys(body).length === 1 && typeof body.enabled === "boolean") {
    action = { action: "setNovemberEnabled", enabled: body.enabled };
  } else {
    // No user-selectable labels, dates, roles, arbitrary campaign slots, or SQL.
    return NextResponse.json(
      { detail: "Only the fixed November campaign transition is supported." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  // Independently signed-session and DB-identity checked by separate local
  // service. Website account retains zero direct DML/sequence rights.
  const result = await callAppearanceWriter("admin", signedSession, action);
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE_HEADERS });
}
