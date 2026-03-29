import { notFound } from "next/navigation";

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

  const snapshot = await loadLiveReplayDetailSnapshot(getPrisma(), decodedSessionKey);
  if (!snapshot) {
    notFound();
  }

  return <LiveReplayDetail initialSnapshot={snapshot} />;
}
