import WoloTransactionRecoveryDashboard from "@/components/admin/WoloTransactionRecoveryDashboard";
import { getPrisma } from "@/lib/prisma";
import { loadWoloTransactionRecoveryDashboard } from "@/lib/woloTransactionRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    status?: string | string[];
    type?: string | string[];
    q?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminWoloTransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const data = await loadWoloTransactionRecoveryDashboard(getPrisma(), {
    status: firstParam(params.status),
    actionType: firstParam(params.type),
    query: firstParam(params.q),
  });

  return <WoloTransactionRecoveryDashboard data={data} />;
}
