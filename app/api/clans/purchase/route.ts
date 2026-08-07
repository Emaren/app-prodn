import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import {
  buildClanAlertBody,
  buildClanHallRequestText,
  CLAN_HALL_REQUEST_MARKER,
  normalizeClanFoundingMessage,
  normalizeClanHallName,
  parseClanHallRequestText,
  slugifyClanHallName,
} from "@/lib/clanHallRequests";
import { buildFeatureRequestInboxMessage } from "@/lib/featureRequestInboxMessage";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import {
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  toUwoLoAmount,
} from "@/lib/woloChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const CLAN_HALL_PRICE_WOLO = 100;

function normalizeAddress(value: unknown) {
  const address = String(value ?? "")
    .trim()
    .toLowerCase();

  return /^wolo1[0-9a-z]{20,90}$/.test(address)
    ? address
    : null;
}

function normalizeTxHash(value: unknown) {
  const hash = String(value ?? "")
    .trim()
    .toUpperCase();

  return /^[A-F0-9]{16,128}$/.test(hash) ? hash : null;
}

function normalizePublicId(value: unknown) {
  const id = String(value ?? "").trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  )
    ? id
    : null;
}

function runtimeConfig() {
  const recipientAddress = normalizeAddress(
    process.env.CLAN_HALL_RECIPIENT_ADDRESS ||
      process.env.WORKSHOP_SPONSOR_RECIPIENT_ADDRESS,
  );

  return {
    ready: Boolean(recipientAddress),
    recipientAddress,
    amountWolo: CLAN_HALL_PRICE_WOLO,
    amountUwolo: BigInt(
      toUwoLoAmount(CLAN_HALL_PRICE_WOLO),
    ),
  };
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

async function requireViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);

  if (!sessionUid) {
    return {
      error: NextResponse.json(
        {
          detail:
            "Sign in with Steam before buying a clan hall.",
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        },
      ),
    };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: {
      uid: sessionUid,
    },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!viewer) {
    return {
      error: NextResponse.json(
        {
          detail:
            "Your AoE2WAR profile could not be found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      ),
    };
  }

  return {
    prisma,
    viewer,
  };
}

const REQUEST_SELECT = {
  publicId: true,
  requestText: true,
  requesterAddress: true,
  sponsorAmountWolo: true,
  sponsorRecipientAddress: true,
  sponsorMemo: true,
  sponsorTxHash: true,
  paymentStatus: true,
  status: true,
  sponsoredAt: true,
  submittedAt: true,
  acceptedAt: true,
  createdAt: true,
} as const;

function requestPayload(request: {
  publicId: string;
  requestText: string | null;
  requesterAddress: string;
  sponsorAmountWolo: number;
  sponsorRecipientAddress: string;
  sponsorMemo: string;
  sponsorTxHash: string | null;
  paymentStatus: string;
  status: string;
  sponsoredAt: Date | null;
  submittedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
}) {
  const details = parseClanHallRequestText(
    request.requestText,
  );

  return {
    publicId: request.publicId,
    clanName: details?.clanName ?? "",
    desiredSlug: details?.desiredSlug ?? "",
    foundingMessage:
      details?.foundingMessage ?? "",
    requesterAddress: request.requesterAddress,
    sponsorAmountWolo: request.sponsorAmountWolo,
    sponsorRecipientAddress:
      request.sponsorRecipientAddress,
    sponsorMemo: request.sponsorMemo,
    sponsorTxHash: request.sponsorTxHash,
    paymentStatus: request.paymentStatus,
    status: request.status,
    sponsoredAt:
      request.sponsoredAt?.toISOString() ?? null,
    submittedAt:
      request.submittedAt?.toISOString() ?? null,
    acceptedAt:
      request.acceptedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const runtime = runtimeConfig();
  const sessionUid = await getSessionUid(request);
  let latestRequest = null;

  if (sessionUid) {
    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: {
        uid: sessionUid,
      },
      select: {
        id: true,
      },
    });

    if (viewer) {
      const latest =
        await prisma.featureRequest.findFirst({
          where: {
            requesterUserId: viewer.id,
            requestText: {
              startsWith: CLAN_HALL_REQUEST_MARKER,
            },
            status: {
              in: [
                "awaiting_payment",
                "awaiting_request",
              ],
            },
          },
          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],
          select: REQUEST_SELECT,
        });

      if (latest) {
        latestRequest = requestPayload(latest);
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      ready: runtime.ready,
      priceWolo: runtime.amountWolo,
      treasury: {
        label: "Clan Hall Treasury",
        address: runtime.recipientAddress,
      },
      latestRequest,
    },
    {
      headers: NO_STORE_HEADERS,
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireViewer(request);

    if ("error" in gate) {
      return gate.error;
    }

    const { prisma, viewer } = gate;
    const body = (await request
      .json()
      .catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "")
      .trim()
      .toLowerCase();
    const runtime = runtimeConfig();

    if (
      !runtime.ready ||
      !runtime.recipientAddress
    ) {
      return NextResponse.json(
        {
          detail:
            "The Clan Hall Treasury is not configured yet.",
        },
        {
          status: 503,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (action === "intent") {
      const requesterAddress = normalizeAddress(
        body.walletAddress,
      );
      const clanName = normalizeClanHallName(
        body.clanName,
      );
      const desiredSlug = slugifyClanHallName(
        body.desiredSlug || clanName,
      );
      const foundingMessage =
        normalizeClanFoundingMessage(
          body.foundingMessage,
        );

      if (!requesterAddress) {
        return NextResponse.json(
          {
            detail:
              "Connect a valid WoloChain wallet before buying a clan hall.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      if (!clanName || !desiredSlug) {
        return NextResponse.json(
          {
            detail:
              "Name the clan before opening the WoloChain payment.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const requestText = buildClanHallRequestText({
        clanName,
        desiredSlug,
        foundingMessage,
      });
      const reuseAfter = new Date(
        Date.now() - 30 * 60 * 1000,
      );

      let intent =
        await prisma.featureRequest.findFirst({
          where: {
            requesterUserId: viewer.id,
            requesterAddress,
            sponsorRecipientAddress:
              runtime.recipientAddress,
            sponsorAmountWolo: runtime.amountWolo,
            requestText: {
              startsWith: CLAN_HALL_REQUEST_MARKER,
            },
            paymentStatus: {
              in: ["awaiting_payment", "broadcast"],
            },
            status: "awaiting_payment",
            createdAt: {
              gte: reuseAfter,
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          select: REQUEST_SELECT,
        });

      if (!intent) {
        const publicId = randomUUID();

        intent = await prisma.featureRequest.create({
          data: {
            publicId,
            requesterUserId: viewer.id,
            requesterUidSnapshot: viewer.uid,
            requesterDisplayNameSnapshot:
              displayName(viewer),
            requestText,
            requesterAddress,
            sponsorAmountWolo: runtime.amountWolo,
            sponsorAmountUwolo: runtime.amountUwolo,
            sponsorRecipientAddress:
              runtime.recipientAddress,
            sponsorMemo:
              `AoE2WAR Clan Hall · ${publicId}`,
            paymentStatus: "awaiting_payment",
            status: "awaiting_payment",
            refundStatus: "not_required",
          },
          select: REQUEST_SELECT,
        });
      } else if (
        intent.paymentStatus ===
          "awaiting_payment" &&
        intent.requestText !== requestText
      ) {
        intent = await prisma.featureRequest.update({
          where: {
            publicId: intent.publicId,
          },
          data: {
            requestText,
          },
          select: REQUEST_SELECT,
        });
      }

      return NextResponse.json(
        {
          ok: true,
          stage: "awaiting_payment",
          request: requestPayload(intent),
        },
        {
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const publicId = normalizePublicId(body.publicId);

    if (!publicId) {
      return NextResponse.json(
        {
          detail:
            "A valid clan hall purchase is required.",
        },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const existing =
      await prisma.featureRequest.findFirst({
        where: {
          publicId,
          requesterUserId: viewer.id,
          requestText: {
            startsWith: CLAN_HALL_REQUEST_MARKER,
          },
        },
        select: {
          id: true,
          ...REQUEST_SELECT,
          sponsorAmountUwolo: true,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          detail:
            "That clan hall purchase could not be found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (action === "verify") {
      if (
        existing.paymentStatus === "confirmed" &&
        existing.sponsorTxHash
      ) {
        return NextResponse.json(
          {
            ok: true,
            stage: "payment_confirmed",
            request: requestPayload(existing),
          },
          {
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const txHash =
        normalizeTxHash(body.txHash) ||
        normalizeTxHash(existing.sponsorTxHash);
      const fromAddress =
        normalizeAddress(body.fromAddress) ||
        existing.requesterAddress;

      if (
        existing.sponsorTxHash &&
        existing.sponsorTxHash !== txHash
      ) {
        return NextResponse.json(
          {
            detail:
              "This clan hall purchase already has a different WoloChain transaction proof.",
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      if (!txHash || !fromAddress) {
        return NextResponse.json(
          {
            detail:
              "The clan hall purchase needs its WoloChain transaction proof.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      if (
        fromAddress !== existing.requesterAddress
      ) {
        return NextResponse.json(
          {
            detail:
              "The connected Keplr account changed after the clan hall purchase opened.",
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const duplicate =
        await prisma.featureRequest.findFirst({
          where: {
            sponsorTxHash: txHash,
            id: {
              not: existing.id,
            },
          },
          select: {
            id: true,
          },
        });

      if (duplicate) {
        return NextResponse.json(
          {
            detail:
              "That WoloChain payment proof has already been used.",
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const broadcastRequest =
        existing.sponsorTxHash === txHash &&
        existing.paymentStatus === "broadcast"
          ? existing
          : await prisma.featureRequest.update({
              where: {
                id: existing.id,
              },
              data: {
                sponsorTxHash: txHash,
                paymentStatus: "broadcast",
              },
              select: {
                id: true,
                ...REQUEST_SELECT,
                sponsorAmountUwolo: true,
              },
            });

      let transfer = null;

      for (
        let attempt = 0;
        attempt < 10;
        attempt += 1
      ) {
        transfer =
          await prisma.woloIndexedTransfer.findFirst(
            {
              where: {
                chainId: WOLO_CHAIN_ID,
                txHash,
                senderAddress:
                  existing.requesterAddress,
                recipientAddress:
                  existing.sponsorRecipientAddress,
                amountUwolo:
                  existing.sponsorAmountUwolo ??
                  BigInt(
                    toUwoLoAmount(
                      existing.sponsorAmountWolo,
                    ),
                  ),
                denom: WOLO_BASE_DENOM,
                memo: existing.sponsorMemo,
              },
              orderBy: {
                transferIndex: "asc",
              },
            },
          );

        if (transfer) {
          break;
        }

        if (attempt < 9) {
          await new Promise((resolve) =>
            setTimeout(resolve, 900),
          );
        }
      }

      if (!transfer) {
        return NextResponse.json(
          {
            ok: false,
            pending: true,
            request: requestPayload(
              broadcastRequest,
            ),
            detail:
              "The payment was broadcast. Waiting for the WoloChain indexer to confirm it.",
          },
          {
            status: 202,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const confirmed =
        await prisma.featureRequest.update({
          where: {
            id: existing.id,
          },
          data: {
            sponsorTxHash: txHash,
            sponsorAmountUwolo:
              transfer.amountUwolo,
            paymentStatus: "confirmed",
            status: "awaiting_request",
            sponsoredAt: transfer.timestamp,
          },
          select: REQUEST_SELECT,
        });

      await recordUserActivity(prisma, {
        userId: viewer.id,
        type: "clan_hall_purchased",
        path: "/clans",
        label: confirmed.publicId,
        metadata: {
          amountWolo:
            confirmed.sponsorAmountWolo,
          txHash: confirmed.sponsorTxHash,
        },
        dedupeWithinSeconds: 60,
      }).catch((error) => {
        console.warn(
          "Failed to mirror clan hall purchase telemetry:",
          error,
        );
      });

      return NextResponse.json(
        {
          ok: true,
          stage: "payment_confirmed",
          request: requestPayload(confirmed),
        },
        {
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (action === "submit") {
      if (existing.paymentStatus !== "confirmed") {
        return NextResponse.json(
          {
            detail:
              "Confirm the 100 WOLO clan hall payment before sending the Clan Alert.",
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const details = parseClanHallRequestText(
        existing.requestText,
      );

      if (!details) {
        return NextResponse.json(
          {
            detail:
              "The clan hall details could not be read.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const firstSubmission =
        existing.submittedAt == null;
      const submitted =
        await prisma.featureRequest.update({
          where: {
            id: existing.id,
          },
          data: {
            status: "submitted",
            submittedAt:
              existing.submittedAt ?? new Date(),
          },
          select: REQUEST_SELECT,
        });

      if (firstSubmission) {
        try {
          const admin =
            await resolvePrimaryAdminContact(prisma);

          if (admin && admin.id !== viewer.id) {
            const conversation =
              await getOrCreateConversationByUsers(
                prisma,
                viewer.id,
                admin.id,
              );

            await prisma.directMessage.create({
              data: {
                conversationId: conversation.id,
                senderUserId: viewer.id,
                body: buildFeatureRequestInboxMessage(
                  {
                    kind: "clan_hall",
                    requester: displayName(viewer),
                    amountWolo:
                      submitted.sponsorAmountWolo,
                    requestId:
                      submitted.publicId,
                    payment:
                      submitted.sponsorTxHash ||
                      "verified",
                    requestText:
                      buildClanAlertBody(details),
                  },
                ),
              },
            });
          }
        } catch (error) {
          console.warn(
            "Clan hall purchase committed, but Clan Alert delivery failed:",
            error,
          );
        }

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "clan_hall_submitted",
          path: "/clans",
          label: submitted.publicId,
          metadata: {
            clanName: details.clanName,
            desiredSlug: details.desiredSlug,
            sponsorTxHash:
              submitted.sponsorTxHash,
          },
          dedupeWithinSeconds: 60,
        }).catch((error) => {
          console.warn(
            "Failed to mirror Clan Alert telemetry:",
            error,
          );
        });
      }

      return NextResponse.json(
        {
          ok: true,
          stage: "submitted",
          request: requestPayload(submitted),
        },
        {
          headers: NO_STORE_HEADERS,
        },
      );
    }

    return NextResponse.json(
      {
        detail:
          "That clan hall purchase action is not supported.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error("Clan hall purchase failed:", error);

    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "The clan hall purchase could not be completed.",
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
