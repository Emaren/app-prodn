import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UWOLO_DECIMALS = 6;

const DEFAULT_ALIASES: Record<string, string> = {
  wolo17nkhws8wq48s98ytrgn7exfaz9mltgahxl9hf8: "Founder Cold Wallet",
  wolo18vu2rz7wnnmtnyjzmqxarus94njt4x4t3p8z4a: "DEX Liquidity",
  wolo1tn9qxc9ruqjz9lqrja0qz8vrn72mkk9p7repsp: "Community Treasury",
  wolo1jx4n3n2ey6uzfq28kplkmpd2am98xsmcn0nerx: "Faucet Drip Reserve",
  wolo1uu0lwp9s9ugvuydxrlfg2vrvamaehkf9kv8q4t: "Validator Ops",
  wolo1fxw6u72zaf0xt47n5mj99yvsxhy6fq8j63wz62: "Ecosystem Bounties",
  wolo1yj2u283x3c25rdp34ytpju02xyaz47cx5g2ssj: "Founder Operating / Emaren",
  wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz: "Jim",
  wolo1mcmckkr360n47wyc408xmlsv4tzw95kkczvfp9: "Sniper",
  wolo1t4jq7wd4x030t9f0yfqfq74pt4pmaep5nu67y4: "Bet Escrow",
  wolo1n0yg6ltqxl05ljaqftvvtgec5qavf9a3uh090h: "Julio Alvarez",
  wolo1ntal93v8c5wryq2d9puhks8l25zedhepyv8n5k: "[BDB]Pigman",
  wolo1cy04t5af0mr9d8n6rrzgr8e9j4vuf42nfg02q5: "Bet Payout",
  wolo1fl48vsnmsdzcv85q5d2q4z5ajdha8yu3aqv4s2: "Validator Ops Reserve",
  wolo1yyuu097eppte7qya48r3dth86smdl3sjyxg284: "DM Linked Wallet",
  wolo1ptwu2lnm5nzpzup9v9kree67x2t8fd2rck7uc4: "Faucet/Test Wallet 01",
  wolo19cwjk5z5rw4wc4ymfevtncw9rmv5akrahmjw7c: "Faucet/Test Wallet 02",
  wolo1r82vt3jmnhc2qudz2h2578g8arpgwr997z0l8n: "Faucet/Test Wallet 03",
  wolo147z5hs875wqdjarqxvhdjheeze9cn66d38vus5: "Faucet/Test Wallet 04",
  wolo12knhgh73p2k8l0l46syruw00rjeazhgsma83eq: "Faucet/Test Wallet 05",
  wolo1j5xzt48ql2gg5eh5p0xgy0048gahqyq2gfdt8r: "Faucet/Test Wallet 06",
  wolo1f2nrhnwuu23t32x5k2d74g0jwtjcpcsl355urv: "Faucet/Test Wallet 07",
  wolo178vwml3r64rjawaujk700rvw6chr7lkg7yaean: "Faucet/Test Wallet 08",
  wolo1ahjjy7us2frzmgp6kcv6tsk76mg8a4308vv54m: "Faucet/Test Wallet 09",
  wolo1jv65s3grqf6v6jl3dp4t6c9t9rk99cd80ypxqz: "Faucet/Test Wallet 10",
};

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
    "https://rest.aoe2hdbets.com"
  ).replace(/\/+$/, "");
}

async function loadAliases() {
  const aliases = { ...DEFAULT_ALIASES };
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

      aliases[match[1]] = match[2].trim();
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

    const holders = owners.map((owner, index) => ({
      rank: index + 1,
      alias: aliases[owner.address] || "Unaliased",
      address: owner.address,
      balanceWolo: formatWolo(owner.amountUwolo),
      balanceWoloFormatted: formatWolo(owner.amountUwolo, true),
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
