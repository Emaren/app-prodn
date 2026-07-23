import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import { buildFeatureRequestInboxMessage } from "@/lib/featureRequestInboxMessage";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import { WOLO_BASE_DENOM, WOLO_CHAIN_ID, toUwoLoAmount } from "@/lib/woloChain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const DEFAULT_SPONSOR_WOLO = 100;

function normalizeAddress(value: unknown) {
  const address = String(value ?? "")
    .trim()
    .toLowerCase();

  return /^wolo1[0-9a-z]{20,90}$/.test(address) ? address : null;
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

function normalizeRequestText(value: unknown) {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (text.length < 3 || text.length > 4_000) {
    return null;
  }

  return text;
}

function sponsorRuntime() {
  const recipientAddress = normalizeAddress(
    process.env.WORKSHOP_SPONSOR_RECIPIENT_ADDRESS,
  );

  const configuredAmount = Number.parseInt(
    process.env.WORKSHOP_SPONSOR_AMOUNT_WOLO || "",
    10,
  );

  const amountWolo =
    Number.isFinite(configuredAmount) && configuredAmount > 0
      ? configuredAmount
      : DEFAULT_SPONSOR_WOLO;

  return {
    ready: Boolean(recipientAddress),
    recipientAddress,
    amountWolo,
    amountUwolo: BigInt(toUwoLoAmount(amountWolo)),
  };
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

async function requireViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);

  if (!sessionUid) {
    return {
      error: NextResponse.json(
        {
          detail: "Sign in with Steam before sponsoring a Workshop feature.",
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
      walletAddress: true,
    },
  });

  if (!viewer) {
    return {
      error: NextResponse.json(
        {
          detail: "Your AoE2WAR profile could not be found.",
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
  startedAt: Date | null;
  completedAt: Date | null;
  declinedAt: Date | null;
  refundedAt: Date | null;
  refundStatus: string;
  developmentValueWolo: number | null;
  createdAt: Date;
}) {
  return {
    publicId: request.publicId,
    requestText: request.requestText,
    requesterAddress: request.requesterAddress,
    sponsorAmountWolo: request.sponsorAmountWolo,
    sponsorRecipientAddress: request.sponsorRecipientAddress,
    sponsorMemo: request.sponsorMemo,
    sponsorTxHash: request.sponsorTxHash,
    paymentStatus: request.paymentStatus,
    status: request.status,
    sponsoredAt: request.sponsoredAt?.toISOString() ?? null,
    submittedAt: request.submittedAt?.toISOString() ?? null,
    acceptedAt: request.acceptedAt?.toISOString() ?? null,
    startedAt: request.startedAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null,
    declinedAt: request.declinedAt?.toISOString() ?? null,
    refundedAt: request.refundedAt?.toISOString() ?? null,
    refundStatus: request.refundStatus,
    developmentValueWolo: request.developmentValueWolo,
    createdAt: request.createdAt.toISOString(),
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
  startedAt: true,
  completedAt: true,
  declinedAt: true,
  refundedAt: true,
  refundStatus: true,
  developmentValueWolo: true,
  createdAt: true,
} as const;

export async function GET(request: NextRequest) {
  const runtime = sponsorRuntime();
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
      const latest = await prisma.featureRequest.findFirst({
        where: {
          requesterUserId: viewer.id,
          status: {
            in: ["awaiting_payment", "awaiting_request"],
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
      treasury: {
        label: "Workshop Treasury",
        address: runtime.recipientAddress,
      },
      sponsorAmountWolo: runtime.amountWolo,
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

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    const action = String(body.action ?? "")
      .trim()
      .toLowerCase();

    const runtime = sponsorRuntime();

    if (!runtime.ready || !runtime.recipientAddress) {
      return NextResponse.json(
        {
          detail: "The Workshop Treasury is not configured yet.",
        },
        {
          status: 503,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (action === "intent") {
      const requesterAddress = normalizeAddress(body.walletAddress);

      if (!requesterAddress) {
        return NextResponse.json(
          {
            detail:
              "Connect a valid WoloChain wallet before sponsoring a feature.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const requestText = normalizeRequestText(body.requestText);

      if (!requestText) {
        return NextResponse.json(
          {
            detail:
              "Describe the feature you want to sponsor before opening the WoloChain payment.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const reuseAfter = new Date(Date.now() - 30 * 60 * 1000);

      let intent = await prisma.featureRequest.findFirst({
        where: {
          requesterUserId: viewer.id,
          requesterAddress,
          sponsorRecipientAddress: runtime.recipientAddress,
          sponsorAmountWolo: runtime.amountWolo,
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
            requesterDisplayNameSnapshot: displayName(viewer),
            requestText,
            requesterAddress,
            sponsorAmountWolo: runtime.amountWolo,
            sponsorAmountUwolo: runtime.amountUwolo,
            sponsorRecipientAddress: runtime.recipientAddress,
            sponsorMemo: `AoE2WAR Workshop Sponsor · ${publicId}`,
            paymentStatus: "awaiting_payment",
            status: "awaiting_payment",
            refundStatus: "not_required",
          },
          select: REQUEST_SELECT,
        });
      }

      if (
        intent.paymentStatus === "awaiting_payment" &&
        intent.requestText !== requestText
      ) {
        await prisma.featureRequest.updateMany({
          where: {
            publicId: intent.publicId,
            requesterUserId: viewer.id,
            paymentStatus: "awaiting_payment",
            status: "awaiting_payment",
          },
          data: {
            requestText,
          },
        });

        intent = {
          ...intent,
          requestText,
        };
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
          detail: "A valid Workshop feature request is required.",
        },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const existing = await prisma.featureRequest.findFirst({
      where: {
        publicId,
        requesterUserId: viewer.id,
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
          detail: "That Workshop feature request could not be found.",
        },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    if (action === "verify") {
      if (existing.paymentStatus === "confirmed" && existing.sponsorTxHash) {
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
        normalizeTxHash(body.txHash) || normalizeTxHash(existing.sponsorTxHash);

      const fromAddress =
        normalizeAddress(body.fromAddress) || existing.requesterAddress;

      if (existing.sponsorTxHash && existing.sponsorTxHash !== txHash) {
        return NextResponse.json(
          {
            detail:
              "This Workshop sponsorship already has a different WoloChain transaction proof. Verify the existing payment instead of replacing it.",
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
              "The Workshop needs the WoloChain transaction proof before it can confirm sponsorship.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      if (fromAddress !== existing.requesterAddress) {
        return NextResponse.json(
          {
            detail:
              "The connected Keplr address changed after the Workshop sponsorship was opened.",
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const duplicate = await prisma.featureRequest.findFirst({
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
            detail: "That WoloChain payment proof has already been used.",
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

      for (let attempt = 0; attempt < 10; attempt += 1) {
        transfer = await prisma.woloIndexedTransfer.findFirst({
          where: {
            chainId: WOLO_CHAIN_ID,
            txHash,
            senderAddress: existing.requesterAddress,
            recipientAddress: existing.sponsorRecipientAddress,
            amountUwolo:
              existing.sponsorAmountUwolo ??
              BigInt(toUwoLoAmount(existing.sponsorAmountWolo)),
            denom: WOLO_BASE_DENOM,
            memo: existing.sponsorMemo,
          },
          orderBy: {
            transferIndex: "asc",
          },
        });

        if (transfer) {
          break;
        }

        if (attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
      }

      if (!transfer) {
        return NextResponse.json(
          {
            ok: false,
            pending: true,
            request: requestPayload(broadcastRequest),
            detail:
              "The payment was broadcast. Waiting for the WoloChain indexer to confirm it.",
          },
          {
            status: 202,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const confirmed = await prisma.featureRequest.update({
        where: {
          id: existing.id,
        },
        data: {
          sponsorTxHash: txHash,
          sponsorAmountUwolo: transfer.amountUwolo,
          paymentStatus: "confirmed",
          status: "awaiting_request",
          sponsoredAt: transfer.timestamp,
        },
        select: REQUEST_SELECT,
      });

      await recordUserActivity(prisma, {
        userId: viewer.id,
        type: "workshop_feature_sponsored",
        path: "/workshop",
        label: confirmed.publicId,
        metadata: {
          amountWolo: confirmed.sponsorAmountWolo,
          recipientAddress: confirmed.sponsorRecipientAddress,
          txHash: confirmed.sponsorTxHash,
        },
        dedupeWithinSeconds: 60,
      }).catch((error) => {
        console.warn("Failed to mirror Workshop sponsorship telemetry:", error);
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
              "Confirm the 100 WOLO Workshop sponsorship before submitting the feature idea.",
          },
          {
            status: 409,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const requestText = normalizeRequestText(body.requestText);

      if (!requestText) {
        return NextResponse.json(
          {
            detail:
              "Tell the Workshop what you want built in at least a few words.",
          },
          {
            status: 400,
            headers: NO_STORE_HEADERS,
          },
        );
      }

      const firstSubmission = existing.submittedAt == null;

      const submitted = await prisma.featureRequest.update({
        where: {
          id: existing.id,
        },
        data: {
          requestText,
          status: "submitted",
          submittedAt: existing.submittedAt ?? new Date(),
        },
        select: REQUEST_SELECT,
      });

      if (firstSubmission) {
        try {
          const admin = await resolvePrimaryAdminContact(prisma);

          if (admin && admin.id !== viewer.id) {
            const conversation = await getOrCreateConversationByUsers(
              prisma,
              viewer.id,
              admin.id,
            );

            await prisma.directMessage.create({
              data: {
                conversationId: conversation.id,
                senderUserId: viewer.id,
                body: buildFeatureRequestInboxMessage({
                  requester: displayName(viewer),
                  amountWolo: submitted.sponsorAmountWolo,
                  requestId: submitted.publicId,
                  payment: submitted.sponsorTxHash || "verified",
                  requestText,
                }),
              },
            });
          }
        } catch (error) {
          console.warn(
            "FeatureRequest committed, but inbox mirror failed:",
            error,
          );
        }

        await recordUserActivity(prisma, {
          userId: viewer.id,
          type: "workshop_feature_submitted",
          path: "/workshop",
          label: submitted.publicId,
          metadata: {
            sponsorAmountWolo: submitted.sponsorAmountWolo,
            sponsorTxHash: submitted.sponsorTxHash,
          },
          dedupeWithinSeconds: 60,
        }).catch((error) => {
          console.warn(
            "Failed to mirror Workshop submission telemetry:",
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
        detail: "That Workshop sponsorship action is not supported.",
      },
      {
        status: 400,
        headers: NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error("Workshop sponsorship failed:", error);

    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "The Workshop sponsorship could not be completed.",
      },
      {
        status: 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
}
