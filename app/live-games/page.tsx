import LiveGamesBoard from "@/components/live/LiveGamesBoard";
import { getPrisma } from "@/lib/prisma";
import { loadPublicLiveGamesSnapshot } from "@/lib/liveGamesPublicSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LiveGamesPage() {
  const snapshot = await loadPublicLiveGamesSnapshot(getPrisma());
  return <LiveGamesBoard initialSnapshot={snapshot} />;
}
