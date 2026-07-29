import { NextRequest, NextResponse } from "next/server";

import {
  WOLO_BASE_DENOM,
  WOLO_COIN_DECIMALS,
  WOLO_DISPLAY_DENOM,
  WOLO_MAINNET_CHAIN_ID,
} from "@/lib/woloChain";
import {
  WOLO_MAINNET_NETWORK_ACCOUNTS,
  isWoloNetworkModuleAccount,
  isWoloNetworkRetiredAccount,
  isWoloNetworkUserFacingAccount,
  type WoloMainnetNetworkAccount,
} from "@/lib/woloMainnetNetworkAccounts";
import {
  fetchWoloBalanceAmount,
  fetchWoloSupplyAmount,
} from "@/lib/woloRuntime";
import { loadMainnetStakingPositions } from "@/lib/mainnetStakingPositions";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type WoloNetworkAccountRow = {
  label: string;
  address: string;
  use: string;
  role: string;
  amountUwolo: string;
  amountWolo: string;
  amountWoloFormatted: string;
  directAmountUwolo: string;
  stakedAmountUwolo: string;
  rankingAmountUwolo: string;
  hideBalance: boolean;
  isModule: boolean;
  isRetired: boolean;
  isUserFacing: boolean;
};

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function normalizeAmount(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "0";
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

function subtractAmountStrings(left: string, right: string): string {
  if (compareAmountStrings(left, right) <= 0) {
    return "0";
  }

  let borrow = 0;
  let result = "";
  let leftIndex = left.length - 1;
  let rightIndex = right.length - 1;

  while (leftIndex >= 0) {
    let digit = Number(left[leftIndex]) - borrow;
    const rightDigit = rightIndex >= 0 ? Number(right[rightIndex]) : 0;

    if (digit < rightDigit) {
      digit += 10;
      borrow = 1;
    } else {
      borrow = 0;
    }

    result = String(digit - rightDigit) + result;
    leftIndex -= 1;
    rightIndex -= 1;
  }

  return result.replace(/^0+(?=\d)/, "");
}

function woloNumberToUwoloString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return String(Math.max(0, Math.round(value * 10 ** WOLO_COIN_DECIMALS)));
}

async function loadStakedUwoloByAddress() {
  const stakedUwoloByAddress = new Map<string, string>();

  try {
    const prisma = getPrisma();
    const positions = await loadMainnetStakingPositions(prisma, { take: 10_000 });

    for (const position of positions) {
      const walletAddress = normalizeAddress(position.walletAddress);
      const stakedAmountUwolo = normalizeAmount(
        woloNumberToUwoloString(position.currentStakedWolo || 0),
      );

      if (!walletAddress || stakedAmountUwolo === "0") {
        continue;
      }

      stakedUwoloByAddress.set(
        walletAddress,
        addAmountStrings(stakedUwoloByAddress.get(walletAddress) || "0", stakedAmountUwolo),
      );
    }
  } catch (error) {
    console.error("Failed to load staked WOLO for holder ranking:", error);
  }

  return stakedUwoloByAddress;
}

function groupWholeNumber(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatWolo(amountUwolo: string, grouped = false): string {
  const normalized = normalizeAmount(amountUwolo);
  const padded = normalized.padStart(WOLO_COIN_DECIMALS + 1, "0");
  const whole = padded.slice(0, -WOLO_COIN_DECIMALS) || "0";
  const fraction = padded.slice(-WOLO_COIN_DECIMALS);
  const wholeText = grouped ? groupWholeNumber(whole) : whole;

  return `${wholeText}.${fraction}`;
}

function sortNetworkRows(rows: WoloNetworkAccountRow[]) {
  return [...rows].sort((left, right) => {
    const amountCompare = compareAmountStrings(left.rankingAmountUwolo, right.rankingAmountUwolo);

    if (amountCompare !== 0) return -amountCompare;
    return left.label.localeCompare(right.label);
  });
}

async function buildNetworkRow(
  account: WoloMainnetNetworkAccount,
  stakedUwoloByAddress: Map<string, string>,
): Promise<WoloNetworkAccountRow> {
  const isPlayerWallet = account.role === "user" || account.use === "Player Wallet";
  const hideBalance = isPlayerWallet;
  const directAmountUwolo = normalizeAmount(await fetchWoloBalanceAmount(account.address));
  const stakedAmountUwolo = isPlayerWallet
    ? normalizeAmount(stakedUwoloByAddress.get(normalizeAddress(account.address)) || "0")
    : "0";
  const rankingAmountUwolo = addAmountStrings(directAmountUwolo, stakedAmountUwolo);
  const amountUwolo = directAmountUwolo;

  return {
    label: account.label,
    address: account.address,
    use: account.use,
    role: account.role,
    amountUwolo,
    directAmountUwolo,
    stakedAmountUwolo,
    rankingAmountUwolo,
    amountWolo: hideBalance ? "" : formatWolo(amountUwolo),
    amountWoloFormatted: hideBalance ? "" : formatWolo(amountUwolo, true),
    hideBalance,
    isModule: isWoloNetworkModuleAccount(account),
    isRetired: isWoloNetworkRetiredAccount(account),
    isUserFacing: isWoloNetworkUserFacingAccount(account),
  };
}

function renderTable(
  rows: WoloNetworkAccountRow[],
  supplyUwolo: string,
  knownAddressTotalUwolo: string,
  totalSource: string,
) {
  const untrackedUwolo = subtractAmountStrings(supplyUwolo, knownAddressTotalUwolo);
  const lines = [
    `${"LABEL".padEnd(42)} ${"ADDRESS".padEnd(48)} ${"WOLO".padStart(18)} ROLE`,
    "-".repeat(128),
    ...rows.map((row) => {
      const amountText = row.amountWoloFormatted;

      return `${row.label.padEnd(42)} ${row.address.padEnd(48)} ${amountText.padStart(18)} ${row.use}`;
    }),
    "-".repeat(128),
    `${rows.length} known Wolo addresses`,
    totalSource === "chain_supply"
      ? `${formatWolo(supplyUwolo, true)} WOLO total supply (WoloChain)`
      : `${formatWolo(supplyUwolo, true)} WOLO subtotal across known addresses (chain supply unavailable)`,
    `${formatWolo(knownAddressTotalUwolo, true)} WOLO across known bank balances`,
    ...(untrackedUwolo === "0"
      ? []
      : [`${formatWolo(untrackedUwolo, true)} WOLO outside the known-address balance map`]),
  ];

  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  try {
    const stakedUwoloByAddress = await loadStakedUwoloByAddress();
    const rows = sortNetworkRows(
      await Promise.all(
        WOLO_MAINNET_NETWORK_ACCOUNTS.map((account) =>
          buildNetworkRow(account, stakedUwoloByAddress),
        ),
      ),
    );
    const knownAddressTotalUwolo = rows.reduce(
      (sum, row) => addAmountStrings(sum, row.amountUwolo),
      "0",
    );
    let totalUwolo = knownAddressTotalUwolo;
    let totalSource = "known_address_balances";

    try {
      totalUwolo = normalizeAmount(await fetchWoloSupplyAmount());
      totalSource = "chain_supply";
    } catch (error) {
      console.error("Failed to load canonical WOLO supply; using known-address total:", error);
    }

    const untrackedUwolo = subtractAmountStrings(totalUwolo, knownAddressTotalUwolo);
    const format = request.nextUrl.searchParams.get("format");

    if (format === "table" || format === "text" || format === "txt") {
      return new NextResponse(
        renderTable(rows, totalUwolo, knownAddressTotalUwolo, totalSource),
        {
        headers: {
          ...NO_STORE_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
        },
        },
      );
    }

    return NextResponse.json(
      {
        chainId: WOLO_MAINNET_CHAIN_ID,
        denom: WOLO_BASE_DENOM,
        displayDenom: WOLO_DISPLAY_DENOM,
        decimals: WOLO_COIN_DECIMALS,
        count: rows.length,
        totalUwolo,
        totalWolo: formatWolo(totalUwolo),
        totalWoloFormatted: formatWolo(totalUwolo, true),
        totalSource,
        knownAddressTotalUwolo,
        knownAddressTotalWolo: formatWolo(knownAddressTotalUwolo),
        knownAddressTotalWoloFormatted: formatWolo(knownAddressTotalUwolo, true),
        untrackedUwolo,
        untrackedWolo: formatWolo(untrackedUwolo),
        untrackedWoloFormatted: formatWolo(untrackedUwolo, true),
        accounts: rows.map((row) => ({
          label: row.label,
          address: row.address,
          use: row.use,
          role: row.role,
          amountUwolo: row.amountUwolo,
          directAmountUwolo: row.directAmountUwolo,
          stakedAmountUwolo: row.stakedAmountUwolo,
          rankingAmountUwolo: row.rankingAmountUwolo,
          amountWolo: row.amountWolo,
          amountWoloFormatted: row.amountWoloFormatted,
          hideBalance: row.hideBalance,
          isModule: row.isModule,
          isRetired: row.isRetired,
          isUserFacing: row.isUserFacing,
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to load Wolo network map:", error);

    return NextResponse.json(
      { detail: "Wolo network map unavailable." },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
