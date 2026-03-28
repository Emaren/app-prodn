import LiveGamesBoard from "@/components/live/LiveGamesBoard";
import { getPrisma } from "@/lib/prisma";
import { loadLiveGamesSnapshot } from "@/lib/liveGames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LiveGamesPage() {
  const snapshot = await loadLiveGamesSnapshot(getPrisma());
  return <LiveGamesBoard initialSnapshot={snapshot} />;
}
