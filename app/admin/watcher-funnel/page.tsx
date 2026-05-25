import WatcherFunnelDashboard from "@/components/admin/WatcherFunnelDashboard";
import { getPrisma } from "@/lib/prisma";
import { loadWatcherFunnelDashboard } from "@/lib/watcherFunnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminWatcherFunnelPage() {
  const data = await loadWatcherFunnelDashboard(getPrisma());

  return <WatcherFunnelDashboard data={data} />;
}
