/**
 * Published read-only Council directory for the isolated R25 web profile.
 * Only public display fields. No runtime prompts, traces or AI execution.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
export type PublicCouncilRow = {
  slug: string;
  name: string;
  role: string;
  description: string;
  specialty: string;
};
export async function loadNonfinancialPublicAiDirectory(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<PublicCouncilRow[]>(Prisma.sql`
    SELECT slug, name, role, description, specialty
    FROM aoe2war_public_v2.ai_published_council
    ORDER BY slug ASC LIMIT 20
  `);
  return rows.map(({ slug, name, role, description, specialty }) => ({
    slug, name, role, description, specialty,
    telemetry: { medianMs: null, requests: 0 },
  }));
}
