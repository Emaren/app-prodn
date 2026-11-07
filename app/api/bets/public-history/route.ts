import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exactly the already-granted published view. Never use raw financial
// wager / claim tables or the legacy market-initialization workers.
type PublicHistoricalMarketRow = {
  id: number;
  title: string;
  eventLabel: string;
  status: "settled" | "voided" | "under_review";
  sortOrder: number;
  featured: boolean;
  marketType: string;
  leftLabel: string;
  rightLabel: string;
  closeAt: Date | null;
  settledAt: Date | null;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    // One bounded SELECT against the already-approved R25 public v9 view.
    // No background market creation, funding or payouts.
    const published = await getPrisma().$queryRaw<PublicHistoricalMarketRow[]>`
      SELECT m.id, m.title, m."eventLabel", m.status,
             m."sortOrder", m.featured, m."marketType",
             m."leftLabel", m."rightLabel", m."closeAt", m."settledAt"
      FROM aoe2war_public_v9.published_markets AS m
      WHERE m."publicIntegrityEligible" IS TRUE
        AND m.status IN ('settled', 'voided', 'under_review')
      ORDER BY m."settledAt" DESC NULLS LAST, m.id DESC
      LIMIT 48
    `;

    return NextResponse.json(
      {
        schema: "aoe2war.app.bets-published-history.v1",
        status: "PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD",
        generatedAt: new Date().toISOString(),
        financialExecutionAuthorized: false,
        acceptingWagers: false,
        approvingPayouts: false,
        onchainPaymentFinalityVerified: false,
        personalWagersIncluded: false,
        source: "aoe2war_public_v9.published_markets",
        dataWarning:
          "These are database-published historical market labels, not authenticated chain settlement, custody or payout proofs.",
        markets: published.map((market) => ({
          id: market.id,
          title: market.title,
          eventLabel: market.eventLabel,
          recordedStatus: market.status,
          sortOrder: market.sortOrder,
          featured: market.featured,
          marketType: market.marketType,
          leftLabel: market.leftLabel,
          rightLabel: market.rightLabel,
          closeAt: market.closeAt?.toISOString() ?? null,
          settledAt: market.settledAt?.toISOString() ?? null,
          acceptingWagers: false,
          payoutFinalityVerified: false,
        })),
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    return NextResponse.json(
      {
        schema: "aoe2war.app.bets-published-history.v1",
        status: "HOLD_PUBLIC_HISTORY_READMODEL_UNAVAILABLE",
        financialExecutionAuthorized: false,
        acceptingWagers: false,
        approvingPayouts: false,
        onchainPaymentFinalityVerified: false,
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
}
