import type { Metadata } from "next";
import { buildAoe2warOsPublicSnapshot } from "@/lib/aoe2warOsPublic";
import StorageAtlasView from "@/components/aoe2war-os/StorageAtlasView";
import Aoe2warOsDeck from "./Aoe2warOsDeck";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams: Promise<{ view?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { view } = await searchParams;
  if (view === "storage-atlas") {
    return {
      title: "Storage Atlas · AoE2WAR OS",
      description: "Three-drive capacity, retention, evidence coverage and safe-reclamation status.",
      alternates: { canonical: "/aoe2war-os/storage-atlas" },
    };
  }
  return {
    title: "AoE2WAR OS · The Kingdom Machine",
    description: "Source-bound engineering metrics, release status, live GitHub activity, tests, Prisma and kingdom agents.",
  };
}

export default async function Aoe2warOsPage({ searchParams }: PageProps) {
  const { view } = await searchParams;
  if (view === "storage-atlas") return <StorageAtlasView />;
  const initial = await buildAoe2warOsPublicSnapshot({ includeGithub: false });
  return <Aoe2warOsDeck initial={initial} />;
}
