import type { Metadata } from "next";
import { cookies } from "next/headers";

import OracleClient from "@/components/oracle/OracleClient";

import "./oracle-polish.css";
import { loadOracleSnapshot } from "@/lib/oracle";
import { getPrisma } from "@/lib/prisma";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";
import PublicHistoricalMarketArchive from "@/components/production/PublicHistoricalMarketArchive";
import { loadNonfinancialPublicMarketArchive } from "@/lib/nonfinancialPublicMarketArchive";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Oracle",
  description:
    "Forecast the future of AoE2WAR with exact-rule YES and NO pools for growth, games, the WOLO economy, Forge, and the Kingdom.",
  alternates: { canonical: "/oracle" },
  openGraph: {
    title: "The Oracle · AoE2WAR",
    description: "The future is not merely awaited. It is priced.",
    images: [
      {
        url: "/oracle/oracle-hero-bg.webp",
        width: 1915,
        height: 821,
        alt: "The torchlit AoE2WAR Oracle chamber",
      },
    ],
  },
};

export default async function OraclePage() {
  // Oracle positions, user proposals and event identities must never be
  // queried from private tables by the isolated nonfinancial production role.
  if (usesNonfinancialProductionAuth()) {
    let records: Awaited<ReturnType<typeof loadNonfinancialPublicMarketArchive>> = [];
    let available = false;
    try {
      records = await loadNonfinancialPublicMarketArchive(getPrisma());
      available = true;
    } catch {
      console.error("A05_ORACLE_PUBLISHED_ARCHIVE_UNAVAILABLE");
    }
    return <PublicHistoricalMarketArchive heading="The Oracle · Published Archive"
      intro="A read-only record of publicly eligible historical forecast labels. Live positions and payout finality remain on financial HOLD."
      records={records} viewAvailable={available} />;
  }
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const snapshot = await loadOracleSnapshot(getPrisma(), claims?.uid ?? null);

  return <OracleClient initialSnapshot={snapshot} />;
}
