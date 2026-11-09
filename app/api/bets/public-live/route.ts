import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicMarket = {
  id: number;
  title: string;
  eventLabel: string;
  status: "open" | "live" | "closing" | "awaiting_final_proof";
  featured: boolean;
  marketType: string;
  leftLabel: string;
  rightLabel: string;
  closeAt: Date | null;
};

const HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const markets = await getPrisma().$queryRaw<PublicMarket[]>`
      SELECT m.id, m.title, m."eventLabel", m.status,
             m.featured, m."marketType", m."leftLabel",
             m."rightLabel", m."closeAt"
      FROM aoe2war_public_v9.published_markets AS m
      WHERE m."publicIntegrityEligible" IS TRUE
        AND m.status IN ('open', 'live', 'closing', 'awaiting_final_proof')
      ORDER BY m.featured DESC, m."sortOrder" ASC, m.id DESC
      LIMIT 48
    `;
    return NextResponse.json({
      schema: "aoe2war.app.bets-published-live-preview.v1",
      status: "PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD",
      generatedAt: new Date().toISOString(),
      source: "aoe2war_public_v9.published_markets",
      publicIntegrityRequired: true,
      financialExecutionAuthorized: false,
      acceptingWagers: false,
      approvingPayouts: false,
      onchainPaymentFinalityVerified: false,
      personalWagersIncluded: false,
      actualLiquidityProven: false,
      completeMarketCensus: false,
      emptyReason: markets.length === 0 ? "NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS" : null,
      markets: markets.map((market) => ({
        id: market.id, title: market.title, eventLabel: market.eventLabel,
        status: market.status, featured: market.featured,
        marketType: market.marketType, leftLabel: market.leftLabel,
        rightLabel: market.rightLabel,
        closeAt: market.closeAt?.toISOString() ?? null, bettingPermitted: false,
      })),
    }, { headers: HEADERS });
  } catch {
    return NextResponse.json({
      schema: "aoe2war.app.bets-published-live-preview.v1",
      status: "HOLD_APPROVED_PUBLIC_MARKET_VIEW_UNAVAILABLE",
      financialExecutionAuthorized: false,
      acceptingWagers: false,
      approvingPayouts: false,
      onchainPaymentFinalityVerified: false,
      personalWagersIncluded: false,
    }, { status: 503, headers: HEADERS });
  }
}
