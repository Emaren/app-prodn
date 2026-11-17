import type { Metadata } from "next";
import { requireServerAdmin } from "@/lib/adminSession";
import Kt84Cockpit from "@/components/kingdom-traders/Kt84Cockpit";

export const metadata: Metadata = {
  title: "Kingdom Traders · Protected PAPER Observatory",
  description: "Owner-authenticated, nonspending Stellar research and signed PAPER evidence."
};
export const dynamic = "force-dynamic";

/** The public gateway is separate; access to any PAPER evidence is admin-only. */
export default async function KingdomTradersCockpitPage() {
  await requireServerAdmin();
  return <Kt84Cockpit />;
}
