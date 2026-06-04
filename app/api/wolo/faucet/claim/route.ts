import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";

import { NextRequest, NextResponse } from "next/server";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_MAINNET_CHAIN_ID,
  isWoloMainnet,
} from "@/lib/woloChain";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const CLAIM_AMOUNT_UWOLO = "2000000";
const CLAIM_AMOUNT_WOLO = 2;
const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const FAUCET_LEDGER_PATH =
  process.env.WOLO_FAUCET_LEDGER_PATH?.trim() ||
  path.join(process.cwd(), "storage", "wolo-faucet", "claims.json");
const MAINNET_FAUCET_CLI = "/usr/local/bin/wolochaind-mainnet";
const MAINNET_FAUCET_HOME = "/var/lib/aoe2hdbets-wolo-mainnet";
const MAINNET_FAUCET_NODE_RPC = "http://127.0.0.1:27657";
const isMainnetFaucetRuntime = isWoloMainnet();
const FAUCET_CLI =
  process.env.WOLO_FAUCET_CLI?.trim() ||
  (isMainnetFaucetRuntime
    ? MAINNET_FAUCET_CLI
    : path.join(os.homedir(), "projects", "WoloChain", "build", "wolochaind"));
const FAUCET_HOME =
  process.env.WOLO_FAUCET_HOME?.trim() ||
  (isMainnetFaucetRuntime ? MAINNET_FAUCET_HOME : path.join(os.homedir(), ".wolochain"));
const FAUCET_FROM =
  process.env.WOLO_FAUCET_FROM?.trim() || (isMainnetFaucetRuntime ? "" : "faucetgrowth");
const FAUCET_CHAIN_ID =
  process.env.WOLO_FAUCET_CHAIN_ID?.trim() ||
  (isMainnetFaucetRuntime ? WOLO_MAINNET_CHAIN_ID : WOLO_CHAIN_ID);
const FAUCET_NODE_RPC =
  process.env.WOLO_FAUCET_NODE_RPC?.trim() ||
  process.env.WOLO_INTERNAL_RPC_URL?.trim() ||
  process.env.WOLO_RPC_URL?.trim() ||
  process.env.NEXT_PUBLIC_WOLO_RPC_URL?.trim() ||
  (isMainnetFaucetRuntime ? MAINNET_FAUCET_NODE_RPC : "http://127.0.0.1:26657");
const FAUCET_KEYRING_BACKEND =
  process.env.WOLO_FAUCET_KEYRING_BACKEND?.trim() ||
  (isMainnetFaucetRuntime ? "file" : "test");
const FAUCET_FEE =
  process.env.WOLO_FAUCET_FEE?.trim() || `5000${WOLO_BASE_DENOM}`;

type FaucetClaimRecord = {
  claimedAtMs: number;
  cooldownEndsAtMs: number;
  txhash: string;
  amountUwoLo: string;
};

type FaucetClaimLedger = Record<string, FaucetClaimRecord>;

function normalizeAddress(value: unknown) {
  return String(value ?? "").trim();
}

function validateWoloAddress(address: string) {
  if (!address) {
    return "Address is required.";
  }

  if (!address.startsWith(`${WOLO_ADDRESS_PREFIX}1`)) {
    return `Address must start with ${WOLO_ADDRESS_PREFIX}1`;
  }

  return null;
}

function isBannedMainnetFaucetTarget(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      (url.port === "26657" || url.port === "8091")
    );
  } catch {
    return /(?:localhost|127\.0\.0\.1):(26657|8091)/.test(value);
  }
}

function validateFaucetRuntimeConfig() {
  if (!isMainnetFaucetRuntime) return null;

  const issues: string[] = [];
  if (FAUCET_CHAIN_ID !== WOLO_MAINNET_CHAIN_ID) {
    issues.push("WOLO_FAUCET_CHAIN_ID must be wolo-1 for mainnet claims.");
  }
  if (!FAUCET_FROM) {
    issues.push("WOLO_FAUCET_FROM must name the wolo-1 app signer key.");
  }
  if (FAUCET_CLI !== MAINNET_FAUCET_CLI && !process.env.WOLO_FAUCET_CLI?.trim()) {
    issues.push("WOLO_FAUCET_CLI must point at the mainnet wolochaind binary.");
  }
  if (FAUCET_HOME !== MAINNET_FAUCET_HOME && !process.env.WOLO_FAUCET_HOME?.trim()) {
    issues.push("WOLO_FAUCET_HOME must point at the mainnet app signer home.");
  }
  if (isBannedMainnetFaucetTarget(FAUCET_NODE_RPC)) {
    issues.push("WOLO_FAUCET_NODE_RPC must not point at the local testnet RPC or 8091.");
  }

  return issues.length > 0 ? issues.join(" ") : null;
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toUwoLoAmount(value: string | null | undefined) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return BigInt(0);
  }
}

function waitForMs(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readFaucetLedger(): Promise<FaucetClaimLedger> {
  try {
    const raw = await fs.readFile(FAUCET_LEDGER_PATH, "utf8");
    const parsed = parseJsonRecord(raw);
    return parsed ? (parsed as FaucetClaimLedger) : {};
  } catch {
    return {};
  }
}

async function writeFaucetLedger(ledger: FaucetClaimLedger) {
  await fs.mkdir(path.dirname(FAUCET_LEDGER_PATH), { recursive: true });
  await fs.writeFile(FAUCET_LEDGER_PATH, JSON.stringify(ledger, null, 2), "utf8");
}

async function sendFaucetTransfer(address: string) {
  const txArgs = [
    "tx",
    "bank",
    "send",
    FAUCET_FROM,
    address,
    `${CLAIM_AMOUNT_UWOLO}${WOLO_BASE_DENOM}`,
    "--home",
    FAUCET_HOME,
    "--node",
    FAUCET_NODE_RPC,
    "--chain-id",
    FAUCET_CHAIN_ID,
    "--keyring-backend",
    FAUCET_KEYRING_BACKEND,
    "--fees",
    FAUCET_FEE,
    "--broadcast-mode",
    "sync",
    "--output",
    "json",
    "-y",
  ];

  const { stdout, stderr } = await execFileAsync(FAUCET_CLI, txArgs, {
    maxBuffer: 1024 * 1024,
    timeout: 45_000,
  });
  const txPayload = parseJsonRecord(stdout);
  const txCode = Number(txPayload?.code ?? 0);
  const txhash = String(txPayload?.txhash || "");

  if (!txPayload || txCode !== 0 || !txhash) {
    const detail = String(
      txPayload?.raw_log ||
        txPayload?.codespace ||
        stderr ||
        "Faucet transfer failed."
    );
    throw new Error(detail);
  }

  return txhash;
}

async function fetchBalanceAfterClaim(address: string, previousAmount: string | null) {
  const minimumAmount =
    previousAmount === null
      ? null
      : toUwoLoAmount(previousAmount) + toUwoLoAmount(CLAIM_AMOUNT_UWOLO);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const amount = await fetchWoloBalanceAmount(address).catch(() => null);
    if (amount !== null && (minimumAmount === null || toUwoLoAmount(amount) >= minimumAmount)) {
      return amount;
    }
    if (attempt < 7) {
      await waitForMs(1200);
    }
  }

  return fetchWoloBalanceAmount(address).catch(() => null);
}

function cooldownPayload(record: FaucetClaimRecord) {
  return {
    detail: "Cooldown active.",
    txhash: record.txhash,
    claimedAtMs: record.claimedAtMs,
    cooldownEndsAtMs: record.cooldownEndsAtMs,
    claimedAmountWolo: CLAIM_AMOUNT_WOLO,
    claimedAmountUwoLo: record.amountUwoLo,
  };
}

export async function POST(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const sessionUid = await resolveRequestUid(request);

    const body = (await request.json().catch(() => ({}))) as { address?: string };
    const address = normalizeAddress(body.address);
    const addressError = validateWoloAddress(address);

    if (addressError) {
      return NextResponse.json({ detail: addressError }, { status: 400 });
    }

    const runtimeConfigError = validateFaucetRuntimeConfig();
    if (runtimeConfigError) {
      return NextResponse.json(
        { detail: runtimeConfigError },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }

    const now = Date.now();
    const ledger = await readFaucetLedger();
    const existing = ledger[address];

    if (existing && now < existing.cooldownEndsAtMs) {
      return NextResponse.json(cooldownPayload(existing), {
        status: 429,
        headers: NO_STORE_HEADERS,
      });
    }

    const balanceBeforeAmount = await fetchWoloBalanceAmount(address).catch(() => null);
    const txhash = await sendFaucetTransfer(address);
    const claimedAtMs = Date.now();
    const cooldownEndsAtMs = claimedAtMs + FAUCET_COOLDOWN_MS;

    ledger[address] = {
      claimedAtMs,
      cooldownEndsAtMs,
      txhash,
      amountUwoLo: CLAIM_AMOUNT_UWOLO,
    };
    await writeFaucetLedger(ledger);

    const balanceAfterAmount = await fetchBalanceAfterClaim(address, balanceBeforeAmount);

    if (sessionUid) {
      const user = await prisma.user.findUnique({
        where: { uid: sessionUid },
        select: { id: true },
      });

      if (user) {
        await recordUserActivity(prisma, {
          userId: user.id,
          type: "wolo_faucet_claimed",
          path: "/wallet",
          label: "WOLO faucet",
          metadata: {
            address,
            txhash,
            claimedAmountWolo: CLAIM_AMOUNT_WOLO,
            claimedAmountUwoLo: CLAIM_AMOUNT_UWOLO,
          },
          dedupeWithinSeconds: 30,
        });
      }
    }

    return NextResponse.json(
      {
        ok: true,
        txhash,
        claimedAtMs,
        cooldownEndsAtMs,
        claimedAmountWolo: CLAIM_AMOUNT_WOLO,
        claimedAmountUwoLo: CLAIM_AMOUNT_UWOLO,
        balanceAfter: {
          address,
          denom: WOLO_BASE_DENOM,
          amount: balanceAfterAmount,
        },
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Could not process faucet claim.";
    return NextResponse.json({ detail }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
