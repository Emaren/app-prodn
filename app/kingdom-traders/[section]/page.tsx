import type { Metadata } from "next";
import { requireServerAdmin } from "@/lib/adminSession";
import { notFound } from "next/navigation";
import Kt84Cockpit from "@/components/kingdom-traders/Kt84Cockpit";

export const metadata: Metadata = {
  title: "Kingdom Traders · Protected PAPER Observatory",
  description: "Owner-authenticated, nonspending Stellar research and signed PAPER evidence."
};
export const dynamic = "force-dynamic";

/** The public gateway is separate; access to any PAPER evidence is admin-only. */
export default async function KingdomTradersCockpitPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  // Authenticate before disclosing any private route names.
  await requireServerAdmin();
  const { section } = await params;
  if (section !== "cockpit") notFound();
  return <Kt84Cockpit />;
}
