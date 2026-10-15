import type { Metadata } from "next";
import { buildAoe2warOsPublicSnapshot } from "@/lib/aoe2warOsPublic";
import Aoe2warOsDeck from "./Aoe2warOsDeck";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "AoE2WAR OS · The Kingdom Machine",
  description: "Source-bound engineering metrics, release status, live GitHub activity, tests, Prisma and kingdom agents.",
};

export default async function Aoe2warOsPage() {
  const initial = await buildAoe2warOsPublicSnapshot();
  return <Aoe2warOsDeck initial={initial} />;
}
