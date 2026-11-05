import type { Metadata } from "next";
import { cookies } from "next/headers";

import OracleClient from "@/components/oracle/OracleClient";

import "./oracle-polish.css";
import { loadOracleSnapshot } from "@/lib/oracle";
import { getPrisma } from "@/lib/prisma";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";
import RestrictedPublicPreview from "@/components/production/RestrictedPublicPreview";
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
    return <RestrictedPublicPreview title="The Oracle" description="Forecast markets are not accepting positions in this nonfinancial release. Only an audited public market projection may be displayed here." />;
  }
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const snapshot = await loadOracleSnapshot(getPrisma(), claims?.uid ?? null);

  return <OracleClient initialSnapshot={snapshot} />;
}
