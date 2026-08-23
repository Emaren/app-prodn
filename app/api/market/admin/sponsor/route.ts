import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  marketplacePaymentMemo,
} from "@/lib/marketplace";
import {
  MARKETPLACE_STANDARD_WOLO,
  normalizeMarketplaceLine,
  normalizeMarketplaceText,
} from "@/lib/marketplaceBusiness";
import {
  loadMarketplaceOwnerConsole,
  requireMarketplaceKingdomOwner,
} from "@/lib/marketplaceOwnerControl";
import {
  getPrisma,
} from "@/lib/prisma";
import {
  getSessionUid,
} from "@/lib/session";
import {
  recordUserActivity,
} from "@/lib/userExperience";
import {
  verifyWoloTransfer,
} from "@/lib/woloBetSettlement";
import {
  buildWoloRestTxLookupUrl,
} from "@/lib/woloChain";
import {
  WOLO_MAINNET_NETWORK_ACCOUNTS,
} from "@/lib/woloMainnetNetworkAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control":
    "private, no-store, max-age=0, must-revalidate",
};

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? (
        value as Record<
          string,
          unknown
        >
      )
    : null;
}

function normalizeTxHash(
  value: unknown,
) {
  const normalized =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return /^[A-F0-9]{16,128}$/.test(
    normalized,
  )
    ? normalized
    : null;
}

function normalizeWoloAddress(
  value: unknown,
) {
  const normalized =
    String(value ?? "")
      .trim()
      .toLowerCase();

  return /^wolo1[0-9a-z]{20,90}$/.test(
    normalized,
  )
    ? normalized
    : null;
}

function isLocalShadow(
  request: NextRequest,
) {
  const host =
    request.nextUrl.hostname
      .toLowerCase();

  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  );
}

function communityTreasuryAddress() {
  const account =
    WOLO_MAINNET_NETWORK_ACCOUNTS.find(
      (candidate) =>
        candidate.role ===
          "treasury" &&
        candidate.use ===
          "Community Treasury",
    );

  return normalizeWoloAddress(
    account?.address,
  );
}

async function gate(
  request: NextRequest,
) {
  const uid =
    await getSessionUid(
      request,
    );

  if (!uid) {
    return null;
  }

  const prisma =
    getPrisma();

  const owner =
    await requireMarketplaceKingdomOwner(
      prisma,
      uid,
    );

  return owner
    ? {
        prisma,
        owner,
      }
    : null;
}

async function verifyMarketplaceMemo(
  txHash: string,
  expectedMemo: string,
) {
  const lookupUrl =
    buildWoloRestTxLookupUrl(
      txHash,
    );

  if (!lookupUrl) {
    return false;
  }

  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    const response =
      await fetch(
        lookupUrl,
        {
          cache: "no-store",
          headers: {
            accept:
              "application/json",
          },
        },
      ).catch(
        () => null,
      );

    if (response?.ok) {
      const payload =
        asRecord(
          await response
            .json()
            .catch(
              () => null,
            ),
        );

      const tx =
        asRecord(
          payload?.tx,
        );

      const body =
        asRecord(
          tx?.body,
        );

      if (
        body?.memo ===
        expectedMemo
      ) {
        return true;
      }
    }

    if (attempt < 4) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            800,
          ),
      );
    }
  }

  return false;
}

export async function GET(
  request: NextRequest,
) {
  const resolved =
    await gate(
      request,
    );

  if (!resolved) {
    return NextResponse.json(
      {
        detail:
          "Marketplace owner authority required.",
      },
      {
        status: 403,
        headers: HEADERS,
      },
    );
  }

  const recipientAddress =
    communityTreasuryAddress();

  if (!recipientAddress) {
    return NextResponse.json(
      {
        detail:
          "Community Treasury is not configured.",
      },
      {
        status: 503,
        headers: HEADERS,
      },
    );
  }

  const paymentEnabled =
    !isLocalShadow(
      request,
    );

  return NextResponse.json(
    {
      ok: true,

      amountWolo:
        MARKETPLACE_STANDARD_WOLO,

      recipientAddress,

      recipientLabel:
        "Community Treasury",

      memo:
        marketplacePaymentMemo(
          "shop_proposal",
        ),

      paymentEnabled,

      detail:
        paymentEnabled
          ? (
              "The Kingdom may sponsor this charter " +
              "with a real 100 WOLO payment."
            )
          : (
              "Local shadow is read-from-production/" +
              "write-local-only. Real WOLO signing " +
              "is disabled here."
            ),
    },
    {
      headers: HEADERS,
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const resolved =
      await gate(
        request,
      );

    if (!resolved) {
      return NextResponse.json(
        {
          detail:
            "Marketplace owner authority required.",
        },
        {
          status: 403,
          headers: HEADERS,
        },
      );
    }

    /*
     * Absolutely no real chain payment may be
     * admitted from the disposable local shadow.
     */
    if (
      isLocalShadow(
        request,
      )
    ) {
      return NextResponse.json(
        {
          detail:
            "Real WOLO sponsorship is disabled " +
            "in the local shadow. Open production " +
            "Marketplace Command to pay and create " +
            "the real proposal.",
        },
        {
          status: 409,
          headers: HEADERS,
        },
      );
    }

    const body =
      (
        await request
          .json()
          .catch(
            () => ({}),
          )
      ) as {
        beneficiaryUid?: unknown;
        shopName?: unknown;
        offer?: unknown;
        txHash?: unknown;
        fromAddress?: unknown;
      };

    const beneficiaryUid =
      normalizeMarketplaceLine(
        body.beneficiaryUid,
        100,
      );

    const shopName =
      normalizeMarketplaceLine(
        body.shopName,
        100,
      );

    const offer =
      normalizeMarketplaceText(
        body.offer,
        900,
      );

    const txHash =
      normalizeTxHash(
        body.txHash,
      );

    const fromAddress =
      normalizeWoloAddress(
        body.fromAddress,
      );

    const recipientAddress =
      communityTreasuryAddress();

    if (
      !beneficiaryUid ||
      !shopName ||
      !offer
    ) {
      return NextResponse.json(
        {
          detail:
            "Choose a proprietor and enter " +
            "the business name and offer.",
        },
        {
          status: 400,
          headers: HEADERS,
        },
      );
    }

    if (
      !txHash ||
      !fromAddress ||
      !recipientAddress
    ) {
      return NextResponse.json(
        {
          detail:
            "A verified 100 WOLO Kingdom " +
            "sponsorship payment is required.",
        },
        {
          status: 400,
          headers: HEADERS,
        },
      );
    }

    if (
      fromAddress ===
      recipientAddress
    ) {
      return NextResponse.json(
        {
          detail:
            "The sponsor wallet cannot be " +
            "the Community Treasury itself.",
        },
        {
          status: 400,
          headers: HEADERS,
        },
      );
    }

    const beneficiary =
      await resolved.prisma
        .user
        .findUnique({
          where: {
            uid:
              beneficiaryUid,
          },
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName:
              true,
          },
        });

    if (!beneficiary) {
      return NextResponse.json(
        {
          detail:
            "That AoE2WAR proprietor could not be found.",
        },
        {
          status: 404,
          headers: HEADERS,
        },
      );
    }

    /*
     * One WoloChain transfer may fund exactly one
     * Marketplace request.
     */
    const duplicatePayment =
      await resolved.prisma
        .userActivityEvent
        .findFirst({
          where: {
            type: {
              in: [
                "market_avatar_commission",
                "market_shop_proposal",
              ],
            },
            label:
              txHash,
          },
          select: {
            id: true,
          },
        });

    if (
      duplicatePayment
    ) {
      return NextResponse.json(
        {
          detail:
            "That WOLO payment proof has already been used.",
        },
        {
          status: 409,
          headers: HEADERS,
        },
      );
    }

    const verification =
      await verifyWoloTransfer({
        txHash,
        fromAddress,
        toAddress:
          recipientAddress,
        expectedAmountWolo:
          MARKETPLACE_STANDARD_WOLO,
      });

    if (
      !verification.verified
    ) {
      return NextResponse.json(
        {
          detail:
            verification.detail ||
            (
              "The 100 WOLO Kingdom sponsorship " +
              "has not appeared on WoloChain yet."
            ),
          txHash,
          proofUrl:
            verification.proofUrl ||
            null,
        },
        {
          status: 422,
          headers: HEADERS,
        },
      );
    }

    const expectedMemo =
      marketplacePaymentMemo(
        "shop_proposal",
      );

    if (
      !(
        await verifyMarketplaceMemo(
          txHash,
          expectedMemo,
        )
      )
    ) {
      return NextResponse.json(
        {
          detail:
            "The WOLO transfer is real, but it " +
            "does not carry the Marketplace " +
            "shop-proposal memo.",
          txHash,
          proofUrl:
            verification.proofUrl ||
            null,
        },
        {
          status: 422,
          headers: HEADERS,
        },
      );
    }

    /*
     * Critical ownership rule:
     *
     * The proposal event belongs to the BENEFICIARY,
     * not to the paying admin. Existing approval
     * therefore creates the eventual shop for the
     * chosen citizen without inventing a parallel
     * authorization system.
     */
    const event =
      await recordUserActivity(
        resolved.prisma,
        {
          userId:
            beneficiary.id,

          type:
            "market_shop_proposal",

          path:
            "/admin/marketplace",

          label:
            txHash,

          metadata: {
            shopName,
            offer,

            state:
              "proposal",

            priceWolo:
              MARKETPLACE_STANDARD_WOLO,

            paymentState:
              "verified",

            txHash,
            fromAddress,

            sponsorship:
              "kingdom_admin",

            sponsoredByUid:
              resolved.owner.uid,

            beneficiaryUid:
              beneficiary.uid,

            beneficiaryName:
              beneficiary.inGameName ||
              beneficiary.steamPersonaName ||
              beneficiary.uid,

            charterRecipientAddress:
              recipientAddress,

            charterRecipientLabel:
              "Community Treasury",

            proofUrl:
              verification.proofUrl ||
              null,
          },
        },
      );

    if (!event) {
      throw new Error(
        "The sponsored Marketplace proposal could not be recorded.",
      );
    }

    return NextResponse.json(
      {
        ok: true,

        proposalEventId:
          event.id,

        txHash,

        console:
          await loadMarketplaceOwnerConsole(
            resolved.prisma,
          ),
      },
      {
        status: 201,
        headers: HEADERS,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : (
                "Kingdom-sponsored business creation failed."
              ),
      },
      {
        status: 500,
        headers: HEADERS,
      },
    );
  }
}
