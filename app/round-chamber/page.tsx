import { cookies } from "next/headers";
import type { Metadata } from "next";

import RoundChamberClient from "@/components/round-chamber/RoundChamberClient";
import { getPrisma } from "@/lib/prisma";
import {
  getRoundChamberSnapshot,
  type RoundChamberSnapshot,
} from "@/lib/roundChamber";
import {
  SESSION_COOKIE_NAME,
  verifySession,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Round Chamber",
  description:
    "Propose, deliberate, and cast one equal civic ballot in the public AoE2WAR Chamber.",
  alternates: {
    canonical: "/round-chamber",
  },
  openGraph: {
    title: "The Round Chamber | AoE2WAR",
    description:
      "Bring an idea to the oak table. Debate it in public. Let the Chronicle remember what the Kingdom chose.",
    images: [
      {
        url: "/round-chamber/round-chamber-senate-hero.png",
        alt: "The monumental AoE2WAR Round Chamber Senate",
      },
    ],
  },
};

export default async function RoundChamberPage() {
  const cookieStore = await cookies();
  const claims = await verifySession(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );

  let initialSnapshot: RoundChamberSnapshot | null = null;

  try {
    initialSnapshot = await getRoundChamberSnapshot(
      getPrisma(),
      claims?.uid ?? null,
    );
  } catch (error) {
    // Keep the existing client-side recovery path if the initial
    // server snapshot is temporarily unavailable.
    console.error(
      "[round-chamber] initial snapshot unavailable",
      error,
    );
  }

  return (
    <RoundChamberClient
      initialSnapshot={initialSnapshot}
    />
  );
}
