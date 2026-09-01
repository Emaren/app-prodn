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
import { WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS } from "@/lib/woloMainnetWallets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import { evaluateFaucetClaimPolicy } from "@/lib/woloFaucetPolicy";

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
const MAINNET_FAUCET_KEY_NAME = "faucet-hot-mainnet";
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
  process.env.WOLO_FAUCET_FROM?.trim() ||
  (isMainnetFaucetRuntime ? MAINNET_FAUCET_KEY_NAME : "faucetgrowth");
const FAUCET_ADDRESS = normalizeAddress(process.env.WOLO_FAUCET_ADDRESS);
const FAUCET_SENDER_ADDRESS =
  isMainnetFaucetRuntime ? WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS : FAUCET_FROM;
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
  (isMainnetFaucetRuntime ? "test" : "test");
const FAUCET_FEE =
  process.env.WOLO_FAUCET_FEE?.trim() || `5000${WOLO_BASE_DENOM}`;

type FaucetClaimRecord = {
  claimedAtMs: number;
  cooldownEndsAtMs: number;
  txhash: string;
  amountUwoLo: string;
  address?: string;
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
  if (FAUCET_FROM !== MAINNET_FAUCET_KEY_NAME) {
    issues.push("WOLO_FAUCET_FROM must be faucet-hot-mainnet for mainnet claims.");
  }
  if (FAUCET_ADDRESS && FAUCET_ADDRESS !== WOLO_MAINNET_FAUCET_HOT_WALLET_ADDRESS) {
    issues.push("WOLO_FAUCET_ADDRESS must be the funded wolo-1 Faucet Hot Wallet.");
  }
  if (FAUCET_KEYRING_BACKEND !== "test") {
    issues.push("WOLO_FAUCET_KEYRING_BACKEND must be test for the mainnet app signer home.");
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

async function readClaimLedger(
  ledgerPath: string
): Promise<FaucetClaimLedger> {
  try {
    const raw = await fs.readFile(ledgerPath, "utf8");
    const parsed = parseJsonRecord(raw);
    if (!parsed) {
      throw new Error(`Faucet ledger is malformed: ${ledgerPath}`);
    }
    return parsed as FaucetClaimLedger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeJsonAtomic(targetPath: string, value: unknown) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const temporaryPath =
    `${targetPath}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(value, null, 2),
    "utf8"
  );

  await fs.rename(temporaryPath, targetPath);
}

async function writeClaimLedger(
  ledgerPath: string,
  ledger: FaucetClaimLedger
) {
  await writeJsonAtomic(ledgerPath, ledger);
}

async function sendFaucetTransfer(address: string) {
  const txArgs = [
    "tx",
    "bank",
    "send",
    FAUCET_SENDER_ADDRESS,
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

  if (isMainnetFaucetRuntime) {
    txArgs.push("--from", FAUCET_FROM);
  }

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

const FAUCET_ACCOUNT_LEDGER_PATH = path.join(
  path.dirname(FAUCET_LEDGER_PATH),
  "claims-by-user.json"
);

const FAUCET_LOCK_PATH = path.join(
  path.dirname(FAUCET_LEDGER_PATH),
  "claim.lock"
);

const FAUCET_CIRCUIT_BREAKER_PATH = path.join(
  path.dirname(FAUCET_LEDGER_PATH),
  "circuit-breaker.json"
);

const FAUCET_LOCK_STALE_MS = 2 * 60 * 1000;
const FAUCET_GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const FAUCET_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
}

const FAUCET_MAX_CLAIMS_PER_HOUR = boundedPositiveInteger(
  process.env.WOLO_FAUCET_MAX_CLAIMS_PER_HOUR,
  30,
  1000
);

const FAUCET_MAX_CLAIMS_PER_DAY = boundedPositiveInteger(
  process.env.WOLO_FAUCET_MAX_CLAIMS_PER_DAY,
  100,
  10_000
);

type FaucetCircuitBreakerState = {
  trippedAtMs: number;
  reason: string;
  hourlyClaims: number;
  dailyClaims: number;
};

async function readFaucetCircuitBreaker():
  Promise<FaucetCircuitBreakerState | null> {
  try {
    const raw = await fs.readFile(
      FAUCET_CIRCUIT_BREAKER_PATH,
      "utf8"
    );
    const parsed = parseJsonRecord(raw);

    if (
      !parsed ||
      typeof parsed.trippedAtMs !== "number" ||
      typeof parsed.reason !== "string"
    ) {
      return {
        trippedAtMs: Date.now(),
        reason: "Circuit-breaker state is malformed.",
        hourlyClaims: 0,
        dailyClaims: 0,
      };
    }

    return {
      trippedAtMs: parsed.trippedAtMs,
      reason: parsed.reason,
      hourlyClaims:
        typeof parsed.hourlyClaims === "number"
          ? parsed.hourlyClaims
          : 0,
      dailyClaims:
        typeof parsed.dailyClaims === "number"
          ? parsed.dailyClaims
          : 0,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function tripFaucetCircuitBreaker(
  state: FaucetCircuitBreakerState
) {
  await writeJsonAtomic(
    FAUCET_CIRCUIT_BREAKER_PATH,
    state
  );

  console.error(
    "[WOLO FAUCET SECURITY] circuit breaker tripped",
    state
  );
}

async function acquireFaucetLock() {
  await fs.mkdir(path.dirname(FAUCET_LOCK_PATH), {
    recursive: true,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(
        FAUCET_LOCK_PATH,
        "wx",
        0o600
      );

      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,
          createdAtMs: Date.now(),
        }),
        "utf8"
      );

      return async () => {
        await handle.close().catch(() => undefined);
        await fs.unlink(FAUCET_LOCK_PATH).catch(
          () => undefined
        );
      };
    } catch (error) {
      const code =
        (error as NodeJS.ErrnoException).code;

      if (code !== "EEXIST") {
        throw error;
      }

      const stat = await fs
        .stat(FAUCET_LOCK_PATH)
        .catch(() => null);

      if (
        attempt === 0 &&
        stat &&
        Date.now() - stat.mtimeMs >
          FAUCET_LOCK_STALE_MS
      ) {
        await fs.unlink(FAUCET_LOCK_PATH).catch(
          () => undefined
        );
        continue;
      }

      return null;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  let releaseLock: null | (() => Promise<void>) = null;

  try {
    /*
     * Financial boundary:
     * faucet identity must come from the signed session cookie.
     * Legacy UID headers/body fields are deliberately not accepted here.
     */
    const sessionUid = await getSessionUid(request);

    if (!sessionUid) {
      return NextResponse.json(
        {
          detail:
            "Sign in with Steam before claiming WOLO.",
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const prisma = getPrisma();

    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        uid: true,
        steamId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          detail:
            "Authenticated AoE2WAR user was not found.",
        },
        {
          status: 401,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    /*
     * A signed cookie alone is not enough for a faucet identity.
     * Steam ID is unique in the AoE2WAR user model and makes mass
     * disposable guest-session creation useless against this route.
     */
    if (!user.steamId) {
      return NextResponse.json(
        {
          detail:
            "A Steam-linked AoE2WAR account is required to claim WOLO.",
        },
        {
          status: 403,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const body = (
      await request.json().catch(() => ({}))
    ) as {
      address?: string;
    };

    const address = normalizeAddress(body.address);
    const addressError =
      validateWoloAddress(address);

    if (addressError) {
      return NextResponse.json(
        { detail: addressError },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const runtimeConfigError =
      validateFaucetRuntimeConfig();

    if (runtimeConfigError) {
      return NextResponse.json(
        { detail: runtimeConfigError },
        {
          status: 503,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    /*
     * One payout lane at a time.
     *
     * This prevents two simultaneous requests from both passing
     * cooldown checks before either has persisted its result.
     */
    releaseLock = await acquireFaucetLock();

    if (!releaseLock) {
      return NextResponse.json(
        {
          detail:
            "Faucet is processing another claim. Try again shortly.",
        },
        {
          status: 429,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const breaker =
      await readFaucetCircuitBreaker();

    const now = Date.now();

    const [
      addressLedger,
      accountLedger,
    ] = await Promise.all([
      readClaimLedger(FAUCET_LEDGER_PATH),
      readClaimLedger(
        FAUCET_ACCOUNT_LEDGER_PATH
      ),
    ]);

    const existingAddressClaim =
      addressLedger[address];

    const existingAccountClaim =
      accountLedger[user.uid];

    const policy =
      evaluateFaucetClaimPolicy({
        nowMs: now,
        address,
        addressClaim:
          existingAddressClaim ?? null,
        accountClaim:
          existingAccountClaim ?? null,
        circuitBreakerActive:
          Boolean(breaker),
        accountClaims:
          Object.values(accountLedger),
        maxClaimsPerHour:
          FAUCET_MAX_CLAIMS_PER_HOUR,
        maxClaimsPerDay:
          FAUCET_MAX_CLAIMS_PER_DAY,
        hourlyWindowMs:
          FAUCET_GLOBAL_WINDOW_MS,
        dailyWindowMs:
          FAUCET_DAILY_WINDOW_MS,
      });

    if (policy.action === "block") {
      if (
        policy.reason ===
        "circuit_breaker"
      ) {
        return NextResponse.json(
          {
            detail:
              "WOLO faucet is temporarily paused by its security circuit breaker.",
          },
          {
            status: 503,
            headers: NO_STORE_HEADERS,
          }
        );
      }

      if (
        policy.reason ===
          "address_cooldown" &&
        existingAddressClaim
      ) {
        return NextResponse.json(
          cooldownPayload(
            existingAddressClaim
          ),
          {
            status: 429,
            headers: NO_STORE_HEADERS,
          }
        );
      }

      if (
        policy.reason ===
          "account_cooldown" &&
        existingAccountClaim
      ) {
        return NextResponse.json(
          {
            ...cooldownPayload(
              existingAccountClaim
            ),
            detail:
              "This AoE2WAR account has already claimed WOLO during the current cooldown.",
          },
          {
            status: 429,
            headers: NO_STORE_HEADERS,
          }
        );
      }

      throw new Error(
        "Faucet policy returned an inconsistent block decision."
      );
    }

    if (policy.action === "trip") {
      const reason =
        policy.reason ===
        "hourly_limit"
          ? `Hourly confirmed-claim ceiling reached (${policy.hourlyConfirmedClaims}/${FAUCET_MAX_CLAIMS_PER_HOUR}).`
          : `Daily confirmed-claim ceiling reached (${policy.dailyConfirmedClaims}/${FAUCET_MAX_CLAIMS_PER_DAY}).`;

      await tripFaucetCircuitBreaker({
        trippedAtMs: now,
        reason,
        hourlyClaims:
          policy.hourlyConfirmedClaims,
        dailyClaims:
          policy.dailyConfirmedClaims,
      });

      return NextResponse.json(
        {
          detail:
            "WOLO faucet was automatically paused for operator review.",
        },
        {
          status: 503,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    /*
     * Reserve the authenticated identity BEFORE broadcasting.
     *
     * If the process crashes or the CLI returns an uncertain result,
     * the account remains fail-closed instead of being able to
     * immediately request another transfer to a fresh wallet.
     */
    const reservedAtMs = Date.now();
    const reservation: FaucetClaimRecord = {
      claimedAtMs: reservedAtMs,
      cooldownEndsAtMs:
        reservedAtMs + FAUCET_COOLDOWN_MS,
      txhash: "",
      amountUwoLo: CLAIM_AMOUNT_UWOLO,
      address,
    };

    accountLedger[user.uid] = reservation;

    await writeClaimLedger(
      FAUCET_ACCOUNT_LEDGER_PATH,
      accountLedger
    );

    const balanceBeforeAmount =
      await fetchWoloBalanceAmount(
        address
      ).catch(() => null);

    let txhash: string;

    try {
      txhash =
        await sendFaucetTransfer(address);
    } catch (error) {
      console.error(
        "[WOLO FAUCET SECURITY] transfer could not be confirmed after identity reservation",
        {
          userId: user.id,
          address,
          error:
            error instanceof Error
              ? error.message
              : String(error),
        }
      );

      return NextResponse.json(
        {
          detail:
            "Faucet transfer could not be confirmed. Your claim is on a safety hold to prevent a duplicate payout.",
          claimedAtMs:
            reservation.claimedAtMs,
          cooldownEndsAtMs:
            reservation.cooldownEndsAtMs,
        },
        {
          status: 502,
          headers: NO_STORE_HEADERS,
        }
      );
    }

    const claimedAtMs = Date.now();
    const cooldownEndsAtMs =
      claimedAtMs + FAUCET_COOLDOWN_MS;

    const finalRecord: FaucetClaimRecord = {
      claimedAtMs,
      cooldownEndsAtMs,
      txhash,
      amountUwoLo: CLAIM_AMOUNT_UWOLO,
      address,
    };

    /*
     * Finalize account identity first. Even if a later write fails,
     * changing wallet addresses cannot obtain another payout.
     */
    accountLedger[user.uid] =
      finalRecord;

    await writeClaimLedger(
      FAUCET_ACCOUNT_LEDGER_PATH,
      accountLedger
    );

    addressLedger[address] =
      finalRecord;

    await writeClaimLedger(
      FAUCET_LEDGER_PATH,
      addressLedger
    );

    /*
     * Telemetry failure must not turn a successful chain transfer
     * into a false HTTP failure. Durable payout guards above are
     * already committed.
     */
    await recordUserActivity(prisma, {
      userId: user.id,
      type: "wolo_faucet_claimed",
      path: "/wallet",
      label: "WOLO faucet",
      metadata: {
        address,
        txhash,
        claimedAmountWolo:
          CLAIM_AMOUNT_WOLO,
        claimedAmountUwoLo:
          CLAIM_AMOUNT_UWOLO,
        identityMode:
          "signed-steam-session",
      },
      dedupeWithinSeconds: 30,
    }).catch((error) => {
        console.error(
          "[WOLO FAUCET SECURITY] activity telemetry write failed after successful payout",
          {
            userId: user.id,
            txhash,
            error:
              error instanceof Error
                ? error.message
                : String(error),
          }
        );
      });

    const balanceAfterAmount =
      await fetchBalanceAfterClaim(
        address,
        balanceBeforeAmount
      );

    console.info(
      "[WOLO FAUCET] authenticated claim completed",
      {
        userId: user.id,
        address,
        txhash,
      }
    );

    return NextResponse.json(
      {
        ok: true,
        txhash,
        claimedAtMs,
        cooldownEndsAtMs,
        claimedAmountWolo:
          CLAIM_AMOUNT_WOLO,
        claimedAmountUwoLo:
          CLAIM_AMOUNT_UWOLO,
        balanceAfter: {
          address,
          denom: WOLO_BASE_DENOM,
          amount: balanceAfterAmount,
        },
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    console.error(
      "[WOLO FAUCET SECURITY] claim failed",
      error
    );

    return NextResponse.json(
      {
        detail:
          "Could not process faucet claim.",
      },
      {
        status: 502,
        headers: NO_STORE_HEADERS,
      }
    );
  } finally {
    if (releaseLock) {
      await releaseLock();
    }
  }
}
