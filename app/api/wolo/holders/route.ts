import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

import {
  WOLO_MAINNET_WALLET_ALIASES,
  WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS,
} from "@/lib/woloMainnetWallets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UWOLO_DECIMALS = 6;

type DenomOwner = {
  address?: unknown;
  balance?: {
    amount?: unknown;
  };
};

type DenomOwnersResponse = {
  denom_owners?: DenomOwner[];
  pagination?: {
    next_key?: unknown;
  };
};

type HolderRow = {
  rank: number;
  alias: string;
  address: string;
  balanceWolo: string;
  balanceWoloFormatted: string;
};

function normalizeAmount(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return "0";
  }

  return value.replace(/^0+(?=\d)/, "");
}

function compareAmountStrings(left: string, right: string): number {
  const cleanLeft = normalizeAmount(left);
  const cleanRight = normalizeAmount(right);

  if (cleanLeft.length !== cleanRight.length) {
    return cleanLeft.length > cleanRight.length ? 1 : -1;
  }

  return cleanLeft.localeCompare(cleanRight);
}

function addAmountStrings(left: string, right: string): string {
  let carry = 0;
  let result = "";
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;

  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const leftDigit = leftIndex >= 0 ? Number(left[leftIndex]) : 0;
    const rightDigit = rightIndex >= 0 ? Number(right[rightIndex]) : 0;
    const sum = leftDigit + rightDigit + carry;

    result = String(sum % 10) + result;
    carry = Math.floor(sum / 10);
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return result.replace(/^0+(?=\d)/, "");
}

function groupWholeNumber(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatWolo(amountUwolo: string, grouped = false): string {
  const normalized = normalizeAmount(amountUwolo);
  const padded = normalized.padStart(UWOLO_DECIMALS + 1, "0");
  const whole = padded.slice(0, -UWOLO_DECIMALS) || "0";
  const fraction = padded.slice(-UWOLO_DECIMALS);
  const wholeText = grouped ? groupWholeNumber(whole) : whole;

  return `${wholeText}.${fraction}`;
}

function getRestUrl() {
  return (
    process.env.WOLO_REST_URL ||
    process.env.WOLO_SETTLEMENT_PUBLIC_REST_URL ||
    process.env.NEXT_PUBLIC_WOLO_REST_URL ||
    process.env.WOLO_SETTLEMENT_REST_URL ||
    "https://rest-mainnet.aoe2war.com"
  ).replace(/\/+$/, "");
}

async function loadAliases() {
  const staticAliases: Record<string, string> = {
    ...WOLO_MAINNET_WALLET_ALIAS_BY_ADDRESS,
  };
  const aliases: Record<string, string> = { ...staticAliases };
  const aliasFile = process.env.WOLO_WALLET_ALIAS_FILE || "/etc/aoe2hdbets/wolo-wallet-aliases.tsv";

  try {
    const text = await readFile(aliasFile, "utf8");

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const match = line.match(/^(wolo1[0-9a-z]+)\s+(.+)$/);
      if (!match) {
        continue;
      }

      const address = match[1].toLowerCase();
      if (!staticAliases[address]) {
        aliases[address] = match[2].trim();
      }
    }
  } catch {
    // Fallback aliases keep local/dev builds useful.
  }

  return aliases;
}

async function loadDenomOwners(restUrl: string, denom: string) {
  const owners: Array<{ address: string; amountUwolo: string }> = [];
  let nextKey: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      "pagination.limit": "500",
    });

    if (nextKey) {
      params.set("pagination.key", nextKey);
    }

    const response = await fetch(
      `${restUrl}/cosmos/bank/v1beta1/denom_owners/${encodeURIComponent(denom)}?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`WoloChain REST ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as DenomOwnersResponse;

    for (const owner of payload.denom_owners || []) {
      const address = typeof owner.address === "string" ? owner.address : "";
      const amountUwolo = normalizeAmount(owner.balance?.amount);

      if (address.startsWith("wolo1") && amountUwolo !== "0") {
        owners.push({ address, amountUwolo });
      }
    }

    const rawNextKey = payload.pagination?.next_key;
    nextKey = typeof rawNextKey === "string" && rawNextKey.length > 0 ? rawNextKey : null;

    if (!nextKey) {
      break;
    }
  }

  owners.sort((left, right) => {
    const amountCompare = compareAmountStrings(left.amountUwolo, right.amountUwolo);

    if (amountCompare !== 0) {
      return -amountCompare;
    }

    return left.address.localeCompare(right.address);
  });

  return owners;
}

function renderTable(holders: HolderRow[], totalUwolo: string) {
  const lines = [
    `${"ALIAS".padEnd(30)} ${"ADDRESS".padEnd(48)} ${"WOLO".padStart(18)}`,
    "-".repeat(100),
    ...holders.map((holder) =>
      `${holder.alias.padEnd(30)} ${holder.address.padEnd(48)} ${holder.balanceWoloFormatted.padStart(18)}`
    ),
    "-".repeat(100),
    `${holders.length} wallets`,
    `${formatWolo(totalUwolo, true)} WOLO total`,
  ];

  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  try {
    const restUrl = getRestUrl();
    const denom = process.env.WOLO_DENOM || process.env.WOLO_SETTLEMENT_DENOM || "uwolo";
    const aliases = await loadAliases();
    const owners = await loadDenomOwners(restUrl, denom);
    const totalUwolo = owners.reduce(
      (sum, owner) => addAmountStrings(sum, owner.amountUwolo),
      "0"
    );

    const seenOwnerAddresses = new Set(owners.map((owner) => owner.address.toLowerCase()));
    const zeroBalanceAliases = WOLO_MAINNET_WALLET_ALIASES.filter(
      (wallet) => !seenOwnerAddresses.has(wallet.address.toLowerCase())
    );
    const holders = [
      ...owners.map((owner) => ({
        alias: aliases[owner.address] || "Unaliased",
        address: owner.address,
        balanceWolo: formatWolo(owner.amountUwolo),
        balanceWoloFormatted: formatWolo(owner.amountUwolo, true),
      })),
      ...zeroBalanceAliases.map((wallet) => ({
        alias: aliases[wallet.address] || wallet.label,
        address: wallet.address,
        balanceWolo: formatWolo("0"),
        balanceWoloFormatted: formatWolo("0", true),
      })),
    ].map((holder, index) => ({
      ...holder,
      rank: index + 1,
    }));

    const format = request.nextUrl.searchParams.get("format");

    if (format === "table" || format === "text" || format === "txt") {
      return new NextResponse(renderTable(holders, totalUwolo), {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        denom,
        displayDenom: "WOLO",
        count: holders.length,
        totalWolo: formatWolo(totalUwolo),
        totalWoloFormatted: formatWolo(totalUwolo, true),
        holders,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("Failed to load public Wolo holders:", error);

    return NextResponse.json(
      {
        detail: "Wolo holders unavailable.",
      },
      { status: 500 }
    );
  }
}
