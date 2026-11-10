import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminSession";
import { readRestrictedPaperStatus } from "@/lib/kingdomTradersPaperReadonly.mjs";

/**
 * Session C UNMOUNTED server-only admission adapter.
 *
 * Session B must first approve the exact source and authenticated App release.
 * Until that handoff, no Next API route exports this function. There is no
 * browser-origin request to the PAPER service, no operator Basic credential,
 * and no account/finance-table access from this adapter.
 */
export async function getKingdomTradersAdminStatus(
  request: NextRequest,
) {
  const gate = await requireAdmin(request);
  if ("error" in gate) return gate.error;

  if (process.env.KT_PRODUCT_APP_SEAM_ADMITTED !== "TRUE") {
    return NextResponse.json(
      { status: "HOLD_APP_RELEASE_NOT_ADMITTED", paperNewOrdersAllowed: false,
        realOrders: 0 },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const model = await readRestrictedPaperStatus({
    authorizedAdmin: true,
    releaseAdmitted: true,
    // These are filesystem paths read ONLY by the Next server. A distinct
    // STATUS-ONLY machine token must be issued after Session B signoff.
    // The owner's cockpit login is not available to this process.
    machineCredentialFile: process.env.KT_PRODUCT_MACHINE_CREDENTIAL_FILE,
    productCaFile: process.env.KT_PRODUCT_TLS_CA_FILE,
  });

  return NextResponse.json(model, {
    status: model.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
  });
}
