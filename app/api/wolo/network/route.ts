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
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";

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
  isModule: boolean;
  isRetired: boolean;
  isUserFacing: boolean;
};

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
    const amountCompare = compareAmountStrings(left.amountUwolo, right.amountUwolo);

    if (amountCompare !== 0) return -amountCompare;
    return left.label.localeCompare(right.label);
  });
}

async function buildNetworkRow(account: WoloMainnetNetworkAccount): Promise<WoloNetworkAccountRow> {
  const amountUwolo = normalizeAmount(await fetchWoloBalanceAmount(account.address));

  return {
    label: account.label,
    address: account.address,
    use: account.use,
    role: account.role,
    amountUwolo,
    amountWolo: formatWolo(amountUwolo),
    amountWoloFormatted: formatWolo(amountUwolo, true),
    isModule: isWoloNetworkModuleAccount(account),
    isRetired: isWoloNetworkRetiredAccount(account),
    isUserFacing: isWoloNetworkUserFacingAccount(account),
  };
}

function renderTable(rows: WoloNetworkAccountRow[], totalUwolo: string) {
  const lines = [
    `${"LABEL".padEnd(42)} ${"ADDRESS".padEnd(48)} ${"WOLO".padStart(18)} USE`,
    "-".repeat(128),
    ...rows.map(
      (row) =>
        `${row.label.padEnd(42)} ${row.address.padEnd(48)} ${row.amountWoloFormatted.padStart(18)} ${row.use}`
    ),
    "-".repeat(128),
    `${rows.length} known Wolo addresses`,
    `${formatWolo(totalUwolo, true)} WOLO total across known addresses`,
  ];

  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  try {
    const rows = sortNetworkRows(await Promise.all(WOLO_MAINNET_NETWORK_ACCOUNTS.map(buildNetworkRow)));
    const totalUwolo = rows.reduce((sum, row) => addAmountStrings(sum, row.amountUwolo), "0");
    const format = request.nextUrl.searchParams.get("format");

    if (format === "table" || format === "text" || format === "txt") {
      return new NextResponse(renderTable(rows, totalUwolo), {
        headers: {
          ...NO_STORE_HEADERS,
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
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
        accounts: rows.map((row) => ({
          label: row.label,
          address: row.address,
          use: row.use,
          role: row.role,
          amountUwolo: row.amountUwolo,
          amountWolo: row.amountWolo,
          amountWoloFormatted: row.amountWoloFormatted,
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
