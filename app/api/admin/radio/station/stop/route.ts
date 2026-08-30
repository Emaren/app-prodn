import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireRadioWoloOperator,
} from "@/lib/radioWoloOperator";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0",
};

export async function POST(
  request: NextRequest,
) {
  const gate =
    await requireRadioWoloOperator(
      request,
    );

  if ("error" in gate) {
    return gate.error;
  }

  const now =
    new Date();

  await gate.prisma.radioStationState.upsert(
    {
      where: {
        id: 1,
      },
      create: {
        id: 1,
        state:
          "off_air",
        stoppedAt:
          now,
      },
      update: {
        state:
          "off_air",
        stoppedAt:
          now,
      },
    },
  );

  return NextResponse.json(
    {
      ok: true,
      station: {
        state:
          "off_air",
        stoppedAt:
          now.toISOString(),
      },
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
