import { notFound } from "next/navigation";

import ReplayResultReviewWorkspace from "./ReplayResultReviewWorkspace";

export const dynamic = "force-dynamic";

export default async function ReplayResultReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gameStatsId = Number(id);
  if (!Number.isSafeInteger(gameStatsId) || gameStatsId <= 0) notFound();

  return <ReplayResultReviewWorkspace gameStatsId={gameStatsId} />;
}
