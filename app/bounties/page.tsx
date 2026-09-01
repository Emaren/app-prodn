import type { Metadata } from "next";

import BountyBoardViews from "@/components/bounties/BountyBoardViews";
import { loadBountyBoard } from "@/lib/bounties";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const description =
  "Published warrior bounties, open contracts, and transaction-proven bounty history.";

export const metadata: Metadata = {
  title: "AoE2WAR Bounty Board",
  description,
  openGraph: {
    title: "AoE2WAR Bounty Board",
    description,
    url: "https://aoe2war.com/bounties",
    siteName: "AoE2WAR",
    type: "website",
    images: [
      {
        url: "https://aoe2war.com/bounties/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "AoE2WAR Bounty Board — warriors assembled and awaiting their next task",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AoE2WAR Bounty Board",
    description,
    images: [
      "https://aoe2war.com/bounties/opengraph-image.png",
    ],
  },
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
