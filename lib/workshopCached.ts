import { unstable_cache } from "next/cache";

import { getPrisma } from "@/lib/prisma";
import {
  loadPublicWorkshop,
  loadWorkshopChroniclePage,
} from "@/lib/workshop";

async function buildPublicWorkshopSummary() {
  const prisma = getPrisma();

  const [status, activeStream] = await Promise.all([
    prisma.workshopStatus.findUnique({
      where: { id: 1 },
      select: {
        isOpen: true,
        isLive: true,
        activityMode: true,
        headline: true,
        currentProject: true,
        updatedAt: true,
      },
    }),
    prisma.workshopStream.findFirst({
      where: { status: "live", isPublic: true },
      select: { publicId: true },
    }),
  ]);

  return {
    isOpen: status?.isOpen ?? false,
    isLive: status?.isLive ?? false,
    activityMode: status?.activityMode ?? "closed",
    headline: status?.headline ?? "THE WORKSHOP RESTS",
    currentProject: status?.currentProject ?? null,
    streamLive: Boolean(activeStream),
    updatedAt: (status?.updatedAt ?? new Date(0)).toISOString(),
  };
}

export const loadCachedPublicWorkshopSummary = unstable_cache(
  buildPublicWorkshopSummary,
  ["public-workshop-summary-v1"],
  {
    revalidate: 30,
    tags: ["workshop-public"],
  },
);

export const loadCachedPublicWorkshop = unstable_cache(
  async () => loadPublicWorkshop(getPrisma()),
  ["public-workshop-v1"],
  {
    revalidate: 30,
    tags: ["workshop-public"],
  },
);

export const loadCachedWorkshopChronicleFirstPage = unstable_cache(
  async () => loadWorkshopChroniclePage(getPrisma(), { take: 18 }),
  ["public-workshop-chronicle-first-v1"],
  {
    revalidate: 30,
    tags: ["workshop-public"],
  },
);
