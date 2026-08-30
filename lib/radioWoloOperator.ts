import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireAdmin,
} from "@/lib/adminSession";

import {
  isRadioWoloOperatorUid,
} from "@/lib/radioWoloOperatorPolicy";

export async function requireRadioWoloOperator(
  request: NextRequest,
) {
  const gate =
    await requireAdmin(request);

  if ("error" in gate) {
    return gate;
  }

  if (
    !isRadioWoloOperatorUid(
      gate.user.uid,
    )
  ) {
    return {
      error: NextResponse.json(
        {
          detail:
            "Radio WOLO operator access required.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  return gate;
}
