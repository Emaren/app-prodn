import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import OracleClient from "@/components/oracle/OracleClient";
import { loadOracleSnapshot } from "@/lib/oracle";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Oracle Market",
    description: `Read the exact rules and crowd probability for the ${decodeURIComponent(slug).replace(/-/g, " ")} Oracle market.`,
    alternates: { canonical: `/oracle/${encodeURIComponent(slug)}` },
    openGraph: {
      title: "The Oracle · AoE2WAR",
      description: "Exact rules. Public probability. The future of the Kingdom.",
      images: [
        {
          url: "/oracle/oracle-hero-bg.webp",
          width: 1915,
          height: 821,
          alt: "The torchlit AoE2WAR Oracle chamber",
        },
      ],
    },
  };
}

export default async function OracleMarketPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const normalizedSlug = decodeURIComponent(slug).trim().toLowerCase();
  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const snapshot = await loadOracleSnapshot(getPrisma(), claims?.uid ?? null);

  if (!snapshot.markets.some((market) => market.slug === normalizedSlug)) {
    notFound();
  }

  return <OracleClient initialSnapshot={snapshot} focusSlug={normalizedSlug} />;
}
