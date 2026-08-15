import { createStaleWhileRevalidateCache } from "@/lib/staleWhileRevalidateCache";
import WatcherFunnelDashboard from "@/components/admin/WatcherFunnelDashboard";
import { getPrisma } from "@/lib/prisma";
import { loadWatcherFunnelDashboard } from "@/lib/watcherFunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loadCachedWatcherFunnelDashboard =
  createStaleWhileRevalidateCache(
    async () => loadWatcherFunnelDashboard(getPrisma()),
    15_000,
  );

export default async function AdminWatcherFunnelPage() {
  const data = await loadCachedWatcherFunnelDashboard();

  return <WatcherFunnelDashboard data={data} />;
}
