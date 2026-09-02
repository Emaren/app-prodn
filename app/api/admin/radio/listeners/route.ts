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
