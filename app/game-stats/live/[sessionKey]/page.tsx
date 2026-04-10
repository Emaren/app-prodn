import { notFound, redirect } from "next/navigation";

import LiveReplayDetail from "@/components/game-stats/LiveReplayDetail";
import { loadLiveReplayDetailSnapshot } from "@/lib/liveReplayDetail";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LiveReplayDetailPage({
  params,
}: {
  params: Promise<{ sessionKey: string }>;
}) {
  const { sessionKey } = await params;
  const decodedSessionKey = decodeURIComponent(sessionKey);
  const prisma = getPrisma();

  const snapshot = await loadLiveReplayDetailSnapshot(prisma, decodedSessionKey);
  if (!snapshot) {
    notFound();
  }

  if (snapshot.mode === "final" && snapshot.finalGameId) {
    redirect(`/game-stats/${snapshot.finalGameId}`);
  }

  const linkedBetMarket = await prisma.betMarket.findFirst({
    where: {
      linkedSessionKey: decodedSessionKey,
    },
    select: {
      founderBonuses: {
        where: {
          rescindedAt: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          bonusType: true,
          totalAmountWolo: true,
          note: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  const founderBonuses = (linkedBetMarket?.founderBonuses || []).map((bonus) => ({
    id: bonus.id,
    bonusType: (bonus.bonusType === "winner" ? "winner" : "participants") as
      | "winner"
      | "participants",
    totalAmountWolo: bonus.totalAmountWolo,
    note: bonus.note ?? null,
    status: bonus.status,
    createdAt: bonus.createdAt.toISOString(),
  }));

  return <LiveReplayDetail initialSnapshot={snapshot} founderBonuses={founderBonuses} />;
}
