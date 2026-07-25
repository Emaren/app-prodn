import type { Metadata } from "next";

import BountyBoardViews from "@/components/bounties/BountyBoardViews";
import { loadBountyBoard } from "@/lib/bounties";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AoE2WAR Bounty Board",
  description:
    "Available opportunities, locked rewards, paid history, and full authoritative bounty memos.",
};

export default async function BountiesPage() {
  const board =
    await loadBountyBoard(
      getPrisma()
    );

  return (
    <BountyBoardViews
      board={board}
    />
  );
}
