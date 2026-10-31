import type { Metadata } from "next";
import { requireServerAdmin } from "@/lib/adminSession";
import { buildEngineeringProjection } from "@/lib/kingdomEngineeringProjection";
import EngineeringObservatory from "@/components/kingdom-engineering/EngineeringObservatory";

export const metadata: Metadata = {
  title: "Engineering Observatory · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function EngineeringObservatoryAdminPage() {
  await requireServerAdmin();
  return <EngineeringObservatory initial={buildEngineeringProjection("admin")} />;
}
