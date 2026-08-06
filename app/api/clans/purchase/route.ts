import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma";

import {
  getOrCreateConversationByUsers,
  resolvePrimaryAdminContact,
} from "@/lib/contactInbox";
import {
  buildClanAlertMessage,
  normalizeClanFoundingMessage,
  normalizeClanHallName,
  slugifyClanHallName,
} from "@/lib/clanHallRequests";
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

type PurchaseRow = {
  id: number;
  public_id: string;
  requester_user_id: number;
  requester_uid_snapshot: string;
  requester_display_name_snapshot: string;
  clan_name: string;
  desired_slug: string;
  founding_message: string;
  requester_address: string;
  amount_wolo: number;
  recipient_address: string;
  memo: string;
  tx_hash: string | null;
  payment_status: string;
  status: string;
  sponsored_at: Date | null;
  submitted_at: Date | null;
  accepted_at: Date | null;
  created_at: Date;
};

const PURCHASE_COLUMNS = Prisma.sql`
  id,
  public_id::text AS public_id,
  requester_user_id,
  requester_uid_snapshot,
  requester_display_name_snapshot,
  clan_name,
  desired_slug,
  founding_message,
  requester_address,
  amount_wolo,
  recipient_address,
  memo,
  tx_hash,
  payment_status,
  status,
  sponsored_at,
  submitted_at,
  accepted_at,
  created_at
`;

function normalizeAddress(value: unknown) {
  const address = String(value ?? "").trim().toLowerCase();
  return /^wolo1[0-9a-z]{20,90}$/.test(address) ? address : null;
}

function normalizeTxHash(value: unknown) {
  const hash = String(value ?? "").trim().toUpperCase();
  return /^[A-F0-9]{16,128}$/.test(hash) ? hash : null;
}

function normalizePublicId(value: unknown) {
  const id = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id
  )
    ? id
    : null;
}

function runtimeConfig() {
  const recipientAddress = normalizeAddress(
    process.env.CLAN_HALL_RECIPIENT_ADDRESS ||
      process.env.WORKSHOP_SPONSOR_RECIPIENT_ADDRESS
  );

  return {
    ready: Boolean(recipientAddress),
    recipientAddress,
    amountWolo: CLAN_HALL_PRICE_WOLO,
    amountUwolo: BigInt(toUwoLoAmount(CLAN_HALL_PRICE_WOLO)),
  };
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function payload(row: PurchaseRow) {
  return {
    publicId: row.public_id,
    clanName: row.clan_name,
    desiredSlug: row.desired_slug,
    foundingMessage: row.founding_message,
    requesterAddress: row.requester_address,
    amountWolo: row.amount_wolo,
    recipientAddress: row.recipient_address,
    memo: row.memo,
    txHash: row.tx_hash,
    paymentStatus: row.payment_status,
    status: row.status,
    sponsoredAt: row.sponsored_at?.toISOString() ?? null,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    acceptedAt: row.accepted_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

async function requireViewer(request: NextRequest) {
  const uid = await getSessionUid(request);
  if (!uid) {
    return {
      error: NextResponse.json(
        { detail: "Sign in with Steam before buying a clan hall." },
        { status: 401, headers: NO_STORE_HEADERS }
      ),
    };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid },
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
        { detail: "Your AoE2WAR profile could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      ),
    };
  }

  return { prisma, viewer };
}

async function findPurchase(
  prisma: ReturnType<typeof getPrisma>,
  publicId: string,
  requesterUserId: number
) {
  const rows = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
    SELECT ${PURCHASE_COLUMNS}
    FROM clan_hall_purchases
    WHERE public_id = CAST(${publicId} AS uuid)
      AND requester_user_id = ${requesterUserId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function GET(request: NextRequest) {
  const runtime = runtimeConfig();
  const uid = await getSessionUid(request);
  let latestRequest = null;

  if (uid) {
    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid },
      select: { id: true },
    });

    if (viewer) {
      const rows = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
        SELECT ${PURCHASE_COLUMNS}
        FROM clan_hall_purchases
        WHERE requester_user_id = ${viewer.id}
          AND status IN ('awaiting_payment', 'awaiting_request')
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `);
      latestRequest = rows[0] ? payload(rows[0]) : null;
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
    { headers: NO_STORE_HEADERS }
  );
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireViewer(request);
    if ("error" in gate) return gate.error;

    const { prisma, viewer } = gate;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "").trim().toLowerCase();
    const runtime = runtimeConfig();

    if (!runtime.ready || !runtime.recipientAddress) {
      return NextResponse.json(
        { detail: "The Clan Hall Treasury is not configured yet." },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    if (action === "intent") {
      const requesterAddress = normalizeAddress(body.walletAddress);
      const clanName = normalizeClanHallName(body.clanName);
      const desiredSlug = slugifyClanHallName(body.desiredSlug || clanName);
      const foundingMessage = normalizeClanFoundingMessage(body.foundingMessage);

      if (!requesterAddress) {
        return NextResponse.json(
          { detail: "Connect a valid WoloChain wallet before buying a clan hall." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (!clanName || !desiredSlug) {
        return NextResponse.json(
          { detail: "Name the clan before opening the WoloChain payment." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }

      const recent = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
        SELECT ${PURCHASE_COLUMNS}
        FROM clan_hall_purchases
        WHERE requester_user_id = ${viewer.id}
          AND requester_address = ${requesterAddress}
          AND payment_status IN ('awaiting_payment', 'broadcast')
          AND status = 'awaiting_payment'
          AND created_at >= NOW() - INTERVAL '30 minutes'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `);

      let row = recent[0] ?? null;
      if (row) {
        const updated = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
          UPDATE clan_hall_purchases
          SET clan_name = ${clanName},
              desired_slug = ${desiredSlug},
              founding_message = ${foundingMessage},
              updated_at = NOW()
          WHERE id = ${row.id}
          RETURNING ${PURCHASE_COLUMNS}
        `);
        row = updated[0];
      } else {
        const publicId = randomUUID();
        const memo = `AoE2WAR Clan Hall · ${publicId}`;
        const inserted = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
          INSERT INTO clan_hall_purchases (
            public_id,
            requester_user_id,
            requester_uid_snapshot,
            requester_display_name_snapshot,
            clan_name,
            desired_slug,
            founding_message,
            requester_address,
            amount_wolo,
            amount_uwolo,
            recipient_address,
            memo
          ) VALUES (
            CAST(${publicId} AS uuid),
            ${viewer.id},
            ${viewer.uid},
            ${displayName(viewer)},
            ${clanName},
            ${desiredSlug},
            ${foundingMessage},
            ${requesterAddress},
            ${runtime.amountWolo},
            ${runtime.amountUwolo},
            ${runtime.recipientAddress},
            ${memo}
          )
          RETURNING ${PURCHASE_COLUMNS}
        `);
        row = inserted[0];
      }

      return NextResponse.json(
        { ok: true, stage: "awaiting_payment", request: payload(row) },
        { headers: NO_STORE_HEADERS }
      );
    }

    const publicId = normalizePublicId(body.publicId);
    if (!publicId) {
      return NextResponse.json(
        { detail: "A valid clan hall purchase is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const existing = await findPurchase(prisma, publicId, viewer.id);
    if (!existing) {
      return NextResponse.json(
        { detail: "That clan hall purchase could not be found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    if (action === "verify") {
      if (existing.payment_status === "confirmed" && existing.tx_hash) {
        return NextResponse.json(
          { ok: true, stage: "payment_confirmed", request: payload(existing) },
          { headers: NO_STORE_HEADERS }
        );
      }

      const txHash = normalizeTxHash(body.txHash) || normalizeTxHash(existing.tx_hash);
      const fromAddress = normalizeAddress(body.fromAddress) || existing.requester_address;
      if (!txHash || !fromAddress) {
        return NextResponse.json(
          { detail: "The Clan Hall needs the WoloChain transaction proof." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (fromAddress !== existing.requester_address) {
        return NextResponse.json(
          { detail: "The connected Keplr account changed after payment opened." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      const duplicate = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
        SELECT id
        FROM clan_hall_purchases
        WHERE tx_hash = ${txHash}
          AND id <> ${existing.id}
        LIMIT 1
      `);
      if (duplicate[0]) {
        return NextResponse.json(
          { detail: "That WoloChain payment proof has already been used." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      await prisma.$executeRaw(Prisma.sql`
        UPDATE clan_hall_purchases
        SET tx_hash = ${txHash}, payment_status = 'broadcast', updated_at = NOW()
        WHERE id = ${existing.id}
      `);

      let transfer = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        transfer = await prisma.woloIndexedTransfer.findFirst({
          where: {
            chainId: WOLO_CHAIN_ID,
            txHash,
            senderAddress: existing.requester_address,
            recipientAddress: existing.recipient_address,
            amountUwolo: BigInt(toUwoLoAmount(existing.amount_wolo)),
            denom: WOLO_BASE_DENOM,
            memo: existing.memo,
          },
          orderBy: { transferIndex: "asc" },
        });
        if (transfer) break;
        if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 900));
      }

      if (!transfer) {
        const pending = await findPurchase(prisma, publicId, viewer.id);
        return NextResponse.json(
          {
            ok: false,
            pending: true,
            request: pending ? payload(pending) : payload(existing),
            detail: "Payment broadcast. Waiting for the WoloChain indexer.",
          },
          { status: 202, headers: NO_STORE_HEADERS }
        );
      }

      const confirmed = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
        UPDATE clan_hall_purchases
        SET tx_hash = ${txHash},
            payment_status = 'confirmed',
            status = 'awaiting_request',
            sponsored_at = ${transfer.timestamp},
            updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING ${PURCHASE_COLUMNS}
      `);

      await recordUserActivity(prisma, {
        userId: viewer.id,
        type: "clan_hall_purchased",
        path: "/clans",
        label: publicId,
        metadata: { amountWolo: CLAN_HALL_PRICE_WOLO, txHash },
        dedupeWithinSeconds: 60,
      }).catch((error) => console.warn("Clan Hall telemetry failed:", error));

      return NextResponse.json(
        { ok: true, stage: "payment_confirmed", request: payload(confirmed[0]) },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (action === "submit") {
      if (existing.payment_status !== "confirmed") {
        return NextResponse.json(
          { detail: "Confirm the 100 WOLO payment before sending the Clan Alert." },
          { status: 409, headers: NO_STORE_HEADERS }
        );
      }

      const firstSubmission = existing.submitted_at == null;
      const submitted = await prisma.$queryRaw<PurchaseRow[]>(Prisma.sql`
        UPDATE clan_hall_purchases
        SET status = 'submitted',
            submitted_at = COALESCE(submitted_at, NOW()),
            updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING ${PURCHASE_COLUMNS}
      `);
      const saved = submitted[0];

      if (firstSubmission) {
        try {
          const admin = await resolvePrimaryAdminContact(prisma);
          if (admin && admin.id !== viewer.id) {
            const conversation = await getOrCreateConversationByUsers(
              prisma,
              viewer.id,
              admin.id
            );
            await prisma.directMessage.create({
              data: {
                conversationId: conversation.id,
                senderUserId: viewer.id,
                body: buildClanAlertMessage({
                  requester: displayName(viewer),
                  amountWolo: saved.amount_wolo,
                  requestId: saved.public_id,
                  payment: saved.tx_hash || "verified",
                  details: {
                    clanName: saved.clan_name,
                    desiredSlug: saved.desired_slug,
                    foundingMessage: saved.founding_message,
                  },
                }),
              },
            });
          }
        } catch (error) {
          console.warn("Clan Hall saved, but Clan Alert delivery failed:", error);
        }
      }

      return NextResponse.json(
        { ok: true, stage: "submitted", request: payload(saved) },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      { detail: "That clan hall purchase action is not supported." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Clan Hall purchase failed:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Clan Hall purchase failed." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
