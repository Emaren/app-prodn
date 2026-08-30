import { execFile } from "node:child_process";
import http from "http";
import https from "https";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_CHAIN_NAME,
  WOLO_COIN_DECIMALS,
  WOLO_DISPLAY_DENOM,
  WOLO_MONETARY_POLICY_LABEL,
  woloChainConfig,
} from "@/lib/woloChain";
import {
  isValidBech32AccountAddress,
  normalizeMinimalDenomAmount,
} from "@/lib/woloBalanceRead";

const execFileAsync = promisify(execFile);
const WOLO_UPSTREAM_TIMEOUT_MS = 5_000;
const WOLO_CLI_TIMEOUT_MS = 7_500;
const MAX_WOLO_UPSTREAM_RESPONSE_BYTES = 1024 * 1024;

const parsedStaleAfterSeconds = Number.parseInt(
  process.env.WOLO_STATUS_STALE_AFTER_SECONDS || "20",
  10
);
const WOLO_STALE_AFTER_SECONDS =
  Number.isFinite(parsedStaleAfterSeconds) && parsedStaleAfterSeconds > 0
    ? parsedStaleAfterSeconds
    : 20;

type TendermintStatusPayload = {
  result?: {
    node_info?: {
      network?: string;
      moniker?: string;
      version?: string;
    };
    sync_info?: {
      latest_block_hash?: string;
      latest_app_hash?: string;
      latest_block_height?: string;
      latest_block_time?: string;
      catching_up?: boolean;
    };
    validator_info?: {
      address?: string;
    };
  };
};

type TendermintNetInfoPayload = {
  result?: {
    n_peers?: string;
  };
};

type BankBalancesPayload = {
  balances?: Array<{
    denom?: string;
    amount?: string;
  }>;
};

type BankSupplyPayload = {
  amount?: {
    denom?: string;
    amount?: string;
  };
};

type RestNodeInfoPayload = {
  default_node_info?: {
    network?: string;
  };
};

export type WoloBalanceSnapshot = {
  amount: string;
  denom: typeof WOLO_BASE_DENOM;
  decimals: typeof WOLO_COIN_DECIMALS;
  chainId: string;
  source: "rest" | "cli";
  observedAt: string;
};

export type WoloConsensusStatus = "advancing" | "stalled" | "catching_up" | "standby";

export type WoloStatusSnapshot = {
  healthy: boolean;
  chainId: string;
  chainName: string;
  addressPrefix: string;
  baseDenom: string;
  displayDenom: string;
  coinDecimals: number;
  monetaryPolicy: string;
  moniker: string;
  nodeVersion: string;
  latestBlockHeight: string;
  latestBlockTime: string | null;
  lastBlockAgeSeconds: number | null;
  staleAfterSeconds: number;
  peers: number;
  catchingUp: boolean;
  consensusStatus: WoloConsensusStatus;
  statusLabel: string;
  validatorAddress: string | null;
  latestBlockHash: string | null;
  latestAppHash: string | null;
  source: string;
  sourceLabel: string;
  terminalLines: string[];
};

function requestText(url: string) {
  return new Promise<string>((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      reject(new Error(`Unsupported WoloChain upstream protocol ${target.protocol}`));
      return;
    }
    const client = target.protocol === "https:" ? https : http;

    const request = client.request(
      target,
      {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        const declaredLength = Number.parseInt(
          response.headers["content-length"] || "0",
          10,
        );

        if (
          Number.isFinite(declaredLength) &&
          declaredLength > MAX_WOLO_UPSTREAM_RESPONSE_BYTES
        ) {
          response.destroy();
          reject(new Error(`Upstream ${target.hostname} response exceeded the safety bound`));
          return;
        }

        response.on("data", (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.byteLength;
          if (receivedBytes > MAX_WOLO_UPSTREAM_RESPONSE_BYTES) {
            response.destroy();
            reject(new Error(`Upstream ${target.hostname} response exceeded the safety bound`));
            return;
          }
          chunks.push(buffer);
        });

        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`Upstream ${target.hostname} returned ${response.statusCode}`));
            return;
          }

          resolve(body);
        });

        response.on("error", reject);
      }
    );

    request.setTimeout(WOLO_UPSTREAM_TIMEOUT_MS, () => {
      request.destroy(new Error(`Timed out reaching ${target.hostname}`));
    });

    request.on("error", reject);
    request.end();
  });
}

async function requestJson<T>(url: string) {
  const text = await requestText(url);
  return JSON.parse(text) as T;
}

function assertWoloChainIdentity(network: unknown, sourceLabel: string) {
  if (network !== WOLO_CHAIN_ID) {
    const observed = typeof network === "string" && network ? network : "missing";
    throw new Error(
      `Refusing ${sourceLabel} chain ${observed}; expected ${WOLO_CHAIN_ID}.`,
    );
  }
}

async function verifyRestChainIdentity(restSource: string) {
  const payload = await requestJson<RestNodeInfoPayload>(
    `${restSource.replace(/\/$/, "")}/cosmos/base/tendermint/v1beta1/node_info`,
  );
  assertWoloChainIdentity(payload.default_node_info?.network, "REST");
}

async function verifyRpcChainIdentity(rpcSource: string) {
  const payload = await requestJson<TendermintStatusPayload>(
    `${rpcSource.replace(/\/$/, "")}/status`,
  );
  assertWoloChainIdentity(payload.result?.node_info?.network, "RPC");
}

function trimHash(value: string | null | undefined, length = 16) {
  if (!value) return "n/a";
  return value.slice(0, length);
}

function getSourceLabel(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

function getRpcSource() {
  return (
    process.env.WOLO_INTERNAL_RPC_URL ||
    process.env.WOLO_RPC_URL ||
    process.env.NEXT_PUBLIC_WOLO_RPC_URL ||
    woloChainConfig.rpc
  );
}

function getRestSource() {
  return (
    process.env.WOLO_INTERNAL_REST_URL ||
    process.env.WOLO_REST_URL ||
    process.env.NEXT_PUBLIC_WOLO_REST_URL ||
    woloChainConfig.rest
  );
}

function getQueryCliPath() {
  return (
    process.env.WOLO_FAUCET_CLI?.trim() ||
    path.join(os.homedir(), "projects", "WoloChain", "build", "wolochaind")
  );
}

function getQueryCliHome() {
  return process.env.WOLO_FAUCET_HOME?.trim() || path.join(os.homedir(), ".wolochain");
}

function getQueryCliNode() {
  return (
    process.env.WOLO_FAUCET_NODE_RPC?.trim() ||
    process.env.WOLO_INTERNAL_RPC_URL?.trim() ||
    process.env.WOLO_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_WOLO_RPC_URL?.trim() ||
    "http://127.0.0.1:26657"
  );
}

async function fetchWoloBalanceAmountFromCli(address: string) {
  const cliNode = getQueryCliNode();
  const [, { stdout }] = await Promise.all([
    verifyRpcChainIdentity(cliNode),
    execFileAsync(
      getQueryCliPath(),
      [
        "query",
        "bank",
        "balances",
        address,
        "--home",
        getQueryCliHome(),
        "--node",
        cliNode,
        "--chain-id",
        WOLO_CHAIN_ID,
        "--output",
        "json",
      ],
      {
        maxBuffer: MAX_WOLO_UPSTREAM_RESPONSE_BYTES,
        timeout: WOLO_CLI_TIMEOUT_MS,
        killSignal: "SIGKILL",
      },
    ),
  ]);

  const payload = JSON.parse(stdout) as BankBalancesPayload;
  return parseBankBalanceAmount(payload, WOLO_BASE_DENOM);
}

function parseBankBalanceAmount(payload: BankBalancesPayload, expectedDenom: string) {
  if (!payload || !Array.isArray(payload.balances)) {
    throw new Error("WoloChain balance response did not include a balances array.");
  }

  let matchingAmount: string | null = null;

  for (const coin of payload.balances) {
    if (!coin || typeof coin !== "object") {
      throw new Error("WoloChain returned a malformed balance coin.");
    }

    if (
      typeof coin.denom !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9/:._-]{0,127}$/.test(coin.denom)
    ) {
      throw new Error("WoloChain returned a malformed balance denom.");
    }

    const amount = normalizeMinimalDenomAmount(coin.amount);

    if (coin.denom !== expectedDenom) continue;
    if (matchingAmount !== null) {
      throw new Error(`WoloChain returned duplicate ${expectedDenom} balance entries.`);
    }

    matchingAmount = amount;
  }

  return matchingAmount ?? "0";
}

function getLastBlockAgeSeconds(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
}

function formatAgeShort(value: number | null) {
  if (value === null) return "unknown";
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function deriveConsensusStatus({
  healthy,
  catchingUp,
  lastBlockAgeSeconds,
  staleAfterSeconds,
}: {
  healthy: boolean;
  catchingUp: boolean;
  lastBlockAgeSeconds: number | null;
  staleAfterSeconds: number;
}): WoloConsensusStatus {
  if (!healthy) return "standby";
  if (catchingUp) return "catching_up";
  if (lastBlockAgeSeconds === null) return "stalled";
  if (lastBlockAgeSeconds > staleAfterSeconds) return "stalled";
  return "advancing";
}

function getConsensusStatusLabel(status: WoloConsensusStatus) {
  switch (status) {
    case "advancing":
      return "Advancing";
    case "stalled":
      return "Stalled";
    case "catching_up":
      return "Catching up";
    default:
      return "Standby";
  }
}

function buildTerminalLines(snapshot: Omit<WoloStatusSnapshot, "terminalLines">) {
  const stamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return [
    `[${stamp}] dial rpc ${snapshot.sourceLabel}`,
    `[${stamp}] handshake chain ${snapshot.chainId} moniker ${snapshot.moniker}`,
    `[${stamp}] prefix ${snapshot.addressPrefix}1... denom ${snapshot.baseDenom} display ${snapshot.displayDenom}`,
    `[${stamp}] policy ${snapshot.monetaryPolicy}`,
    `[${stamp}] height ${snapshot.latestBlockHeight} peers ${snapshot.peers} consensus ${snapshot.consensusStatus}`,
    `[${stamp}] block_age ${formatAgeShort(snapshot.lastBlockAgeSeconds)} stale_after ${snapshot.staleAfterSeconds}s`,
    `[${stamp}] block_hash ${trimHash(snapshot.latestBlockHash)}`,
    `[${stamp}] app_hash ${trimHash(snapshot.latestAppHash)}`,
    `[${stamp}] validator ${trimHash(snapshot.validatorAddress)}`,
    `[${stamp}] last_block ${snapshot.latestBlockTime || "unknown"}`,
  ];
}

export async function fetchWoloStatusSnapshot(): Promise<WoloStatusSnapshot> {
  const source = getRpcSource();
  const sourceLabel = getSourceLabel(source);

  try {
    const [payload, netInfo] = await Promise.all([
      requestJson<TendermintStatusPayload>(`${source.replace(/\/$/, "")}/status`),
      requestJson<TendermintNetInfoPayload>(`${source.replace(/\/$/, "")}/net_info`).catch(
        () => null
      ),
    ]);

    assertWoloChainIdentity(payload.result?.node_info?.network, "RPC");

    const latestBlockTime = payload.result?.sync_info?.latest_block_time || null;
    const catchingUp = Boolean(payload.result?.sync_info?.catching_up);
    const lastBlockAgeSeconds = getLastBlockAgeSeconds(latestBlockTime);
    const consensusStatus = deriveConsensusStatus({
      healthy: true,
      catchingUp,
      lastBlockAgeSeconds,
      staleAfterSeconds: WOLO_STALE_AFTER_SECONDS,
    });

    const snapshotWithoutLines: Omit<WoloStatusSnapshot, "terminalLines"> = {
      healthy: true,
      chainId: payload.result?.node_info?.network || WOLO_CHAIN_ID,
      chainName: WOLO_CHAIN_NAME,
      addressPrefix: WOLO_ADDRESS_PREFIX,
      baseDenom: WOLO_BASE_DENOM,
      displayDenom: WOLO_DISPLAY_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
      monetaryPolicy: WOLO_MONETARY_POLICY_LABEL,
      moniker: payload.result?.node_info?.moniker || WOLO_CHAIN_NAME,
      nodeVersion: payload.result?.node_info?.version || "unknown",
      latestBlockHeight: payload.result?.sync_info?.latest_block_height || "0",
      latestBlockTime,
      lastBlockAgeSeconds,
      staleAfterSeconds: WOLO_STALE_AFTER_SECONDS,
      peers: Number.parseInt(String(netInfo?.result?.n_peers ?? "0"), 10) || 0,
      catchingUp,
      consensusStatus,
      statusLabel: getConsensusStatusLabel(consensusStatus),
      validatorAddress: payload.result?.validator_info?.address || null,
      latestBlockHash: payload.result?.sync_info?.latest_block_hash || null,
      latestAppHash: payload.result?.sync_info?.latest_app_hash || null,
      source,
      sourceLabel,
    };

    return {
      ...snapshotWithoutLines,
      terminalLines: buildTerminalLines(snapshotWithoutLines),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown node error";

    const fallback: Omit<WoloStatusSnapshot, "terminalLines"> = {
      healthy: false,
      chainId: WOLO_CHAIN_ID,
      chainName: WOLO_CHAIN_NAME,
      addressPrefix: WOLO_ADDRESS_PREFIX,
      baseDenom: WOLO_BASE_DENOM,
      displayDenom: WOLO_DISPLAY_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
      monetaryPolicy: WOLO_MONETARY_POLICY_LABEL,
      moniker: WOLO_CHAIN_NAME,
      nodeVersion: "unknown",
      latestBlockHeight: "0",
      latestBlockTime: null,
      lastBlockAgeSeconds: null,
      staleAfterSeconds: WOLO_STALE_AFTER_SECONDS,
      peers: 0,
      catchingUp: false,
      consensusStatus: "standby",
      statusLabel: "Standby",
      validatorAddress: null,
      latestBlockHash: null,
      latestAppHash: null,
      source,
      sourceLabel,
    };

    return {
      ...fallback,
      terminalLines: [
        `[offline] dial rpc ${sourceLabel}`,
        `[offline] ${detail}`,
        `[offline] consensus standby age unknown stale_after ${WOLO_STALE_AFTER_SECONDS}s`,
        `[offline] chain truth still mounted: ${WOLO_CHAIN_ID} / ${WOLO_BASE_DENOM} / ${WOLO_ADDRESS_PREFIX}1...`,
      ],
    };
  }
}

export async function fetchWoloBalanceSnapshot(address: string): Promise<WoloBalanceSnapshot> {
  const trimmed = address.trim();

  if (!trimmed) {
    throw new Error("Address is required.");
  }

  if (!isValidBech32AccountAddress(trimmed, WOLO_ADDRESS_PREFIX)) {
    throw new Error(`Address must be a valid ${WOLO_ADDRESS_PREFIX}1 account address.`);
  }

  const restSource = getRestSource();

  try {
    const [payload] = await Promise.all([
      requestJson<BankBalancesPayload>(
        `${restSource.replace(/\/$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(trimmed)}`,
      ),
      verifyRestChainIdentity(restSource),
    ]);

    return {
      amount: parseBankBalanceAmount(payload, WOLO_BASE_DENOM),
      denom: WOLO_BASE_DENOM,
      decimals: WOLO_COIN_DECIMALS,
      chainId: WOLO_CHAIN_ID,
      source: "rest",
      observedAt: new Date().toISOString(),
    };
  } catch {
    const amount = await fetchWoloBalanceAmountFromCli(trimmed);

    return {
      amount,
      denom: WOLO_BASE_DENOM,
      decimals: WOLO_COIN_DECIMALS,
      chainId: WOLO_CHAIN_ID,
      source: "cli",
      observedAt: new Date().toISOString(),
    };
  }
}

export async function fetchWoloBalanceAmount(address: string) {
  return (await fetchWoloBalanceSnapshot(address)).amount;
}

export async function fetchWoloSupplyAmount() {
  const restSource = getRestSource();
  const [payload] = await Promise.all([
    requestJson<BankSupplyPayload>(
      `${restSource.replace(/\/$/, "")}/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(WOLO_BASE_DENOM)}`,
    ),
    verifyRestChainIdentity(restSource),
  ]);
  if (payload.amount?.denom !== WOLO_BASE_DENOM) {
    throw new Error(`WoloChain supply denom must be ${WOLO_BASE_DENOM}.`);
  }

  return normalizeMinimalDenomAmount(payload.amount.amount);
}
