import { unstable_cache } from "next/cache";
import WatcherFunnelDashboard from "@/components/admin/WatcherFunnelDashboard";
import { getPrisma } from "@/lib/prisma";
import { loadWatcherFunnelDashboard } from "@/lib/watcherFunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loadCachedWatcherFunnelDashboard = unstable_cache(
  async () => loadWatcherFunnelDashboard(getPrisma()),
  ["admin-watcher-funnel-dashboard-v1"],
  { revalidate: 15 },
);

export default async function AdminWatcherFunnelPage() {
  const data = await loadCachedWatcherFunnelDashboard();

  return <WatcherFunnelDashboard data={data} />;
}
