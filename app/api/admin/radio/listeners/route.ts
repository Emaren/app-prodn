import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  emptyAdminRadioWoloAnalytics,
  loadAdminRadioWoloAnalytics,
} from "@/lib/adminRadioWoloAnalytics";
import {
  requireAdmin,
} from "@/lib/adminSession";
import {
  isLiveProductionReadOnlyPreview,
} from "@/lib/previewDataSource";
import { isNonfinancialPublicReadProfile } from "@/lib/nonfinancialPublicReadProfile";
import { adminRadioListenerReadHoldPayload } from "@/lib/radioWoloRestrictedReadHold";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const gate =
    await requireAdmin(
      request,
    );

  if ("error" in gate) {
    return gate.error;
  }

  // Preserve signed admin eligibility, but never use the legacy Prisma
  // listener/Traffic reader under the restricted C03 production account.
  // Empty analytics would falsely report zero listeners. The independent
  // admin-only nonfinancial projection is not admitted yet.
  if (isNonfinancialPublicReadProfile()) {
    return NextResponse.json(
      adminRadioListenerReadHoldPayload(),
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Vary: "Cookie",
        },
      },
    );
  }

  if (
    isLiveProductionReadOnlyPreview()
  ) {
    return NextResponse.json(
      {
        ...emptyAdminRadioWoloAnalytics(),
        previewReadOnly:
          true,
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store, max-age=0",
        },
      },
    );
  }

  const analytics =
    await loadAdminRadioWoloAnalytics(
      gate.prisma,
    );

  return NextResponse.json(
    analytics,
    {
      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    },
  );
}
