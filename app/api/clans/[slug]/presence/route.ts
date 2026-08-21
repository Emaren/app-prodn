import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  listClanHallPresence,
  removeClanHallPresence,
  touchClanHallPresence,
} from "@/lib/clanHallPresence";
import { clanHallFeatureEnabled } from "@/lib/clanHallFeatures";
import {
  normalizeClanAudience,
} from "@/lib/clans";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control":
    "no-store, max-age=0",
};

function normalizeSlug(value: string) {
  return decodeURIComponent(value)
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return (
    user.inGameName ||
    user.steamPersonaName ||
    user.uid
  );
}

async function resolveViewer(
  request: NextRequest,
  slug: string,
) {
  const uid =
    await getSessionUid(request);

  if (!uid) {
    return {
      ok: false as const,
      status: 401,
      detail:
        "Sign in to enter Hall presence.",
    };
  }

  const prisma = getPrisma();

  const [viewer, clan] =
    await Promise.all([
      prisma.user.findUnique({
        where: { uid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          isAdmin: true,
        },
      }),
      prisma.clan.findFirst({
        where: {
          slug,
          status: "active",
        },
        select: {
          id: true,
          chatAudiencePolicy: true,
        },
      }),
    ]);

  if (!viewer || !clan) {
    return {
      ok: false as const,
      status: 404,
      detail:
        "Hall presence is unavailable.",
    };
  }

  const policy =
    normalizeClanAudience(
      clan.chatAudiencePolicy,
      "public",
    );

  if (policy === "clan") {
    const membership =
      await prisma.clanMember.findUnique({
        where: {
          clanId_userId: {
            clanId: clan.id,
            userId: viewer.id,
          },
        },
        select: {
          status: true,
        },
      });

    if (
      membership?.status !==
        "active" &&
      !viewer.isAdmin
    ) {
      return {
        ok: false as const,
        status: 403,
        detail:
          "This Hall is clan-only.",
      };
    }
  }

  return {
    ok: true as const,
    viewer: {
      uid: viewer.uid,
      displayName:
        displayName(viewer),
    },
  };
}

async function contextFor(
  request: NextRequest,
  paramsPromise: Promise<{
    slug: string;
  }>,
) {
  const params =
    await paramsPromise;
  const slug =
    normalizeSlug(params.slug);

  if (
    !clanHallFeatureEnabled(
      slug,
      "realtime",
    )
  ) {
    return {
      ok: false as const,
      status: 404,
      detail:
        "Hall presence is unavailable.",
    };
  }

  const viewer =
    await resolveViewer(
      request,
      slug,
    );

  if (!viewer.ok) {
    return viewer;
  }

  return {
    ok: true as const,
    slug,
    viewer: viewer.viewer,
  };
}

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
    }>;
  },
) {
  const resolved =
    await contextFor(
      request,
      context.params,
    );

  if (!resolved.ok) {
    return NextResponse.json(
      {
        detail:
          resolved.detail,
        users: [],
      },
      {
        status:
          resolved.status,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  return NextResponse.json(
    {
      users:
        listClanHallPresence(
          resolved.slug,
        ),
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
    }>;
  },
) {
  const resolved =
    await contextFor(
      request,
      context.params,
    );

  if (!resolved.ok) {
    return NextResponse.json(
      {
        detail:
          resolved.detail,
        users: [],
      },
      {
        status:
          resolved.status,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  touchClanHallPresence(
    resolved.slug,
    resolved.viewer,
  );

  return NextResponse.json(
    {
      users:
        listClanHallPresence(
          resolved.slug,
        ),
    },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}

export async function DELETE(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
    }>;
  },
) {
  const resolved =
    await contextFor(
      request,
      context.params,
    );

  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false },
      {
        status:
          resolved.status,
        headers:
          NO_STORE_HEADERS,
      },
    );
  }

  removeClanHallPresence(
    resolved.slug,
    resolved.viewer.uid,
  );

  return NextResponse.json(
    { ok: true },
    {
      headers:
        NO_STORE_HEADERS,
    },
  );
}
