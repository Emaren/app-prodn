import { cookies } from "next/headers";

import { Providers } from "@/app/Providers";
import { BetsInitialSnapshotProvider } from "@/components/bets/BetsInitialSnapshotContext";
import { queueBetMarketEnsure } from "@/lib/betMarketEnsureQueue";
import { loadBetBoardSnapshot, type BetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BetsWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const prisma = getPrisma();
  const cookieStore = await cookies();
  const claims = await verifySession(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );

  let initialSnapshot: BetBoardSnapshot | null = null;
  try {
    queueBetMarketEnsure(prisma, 0);
    initialSnapshot = await loadBetBoardSnapshot(
      prisma,
      claims?.uid ?? null,
      {
        ensureMarkets: false,
        settlementSurfaceMode: "fast",
      },
    );
  } catch (error) {
    // Fail open to the existing client fetch path. The betting page must remain
    // usable even if server bootstrap is temporarily unavailable.
    console.error("Failed to bootstrap bet board:", error);
  }

  return (
    <Providers>
      <BetsInitialSnapshotProvider initialSnapshot={initialSnapshot}>
        {children}
      </BetsInitialSnapshotProvider>
    </Providers>
  );
}
