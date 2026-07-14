import { notFound } from "next/navigation";
import { cookies } from "next/headers";

import LiveReplayDetail from "@/components/game-stats/LiveReplayDetail";
import { loadLiveReplayDetailSnapshot } from "@/lib/liveReplayDetail";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

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

  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const [linkedBetMarket, viewer] = await Promise.all([prisma.betMarket.findFirst({
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
  }), claims?.uid
    ? prisma.user.findUnique({ where: { uid: claims.uid }, select: { isAdmin: true } })
    : Promise.resolve(null)]);

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

  return <LiveReplayDetail initialSnapshot={snapshot} founderBonuses={founderBonuses} showDiagnostics={Boolean(viewer?.isAdmin)} />;
}
