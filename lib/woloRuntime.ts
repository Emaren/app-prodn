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

const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});
const execFileAsync = promisify(execFile);

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
  peers: number;
  catchingUp: boolean;
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
    const client = target.protocol === "https:" ? https : http;

    const request = client.request(
      target,
      {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        agent: target.protocol === "https:" ? insecureHttpsAgent : undefined,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");

          if ((response.statusCode || 500) >= 400) {
            reject(new Error(`Upstream ${target.hostname} returned ${response.statusCode}`));
            return;
          }

          resolve(body);
        });
      }
    );

    request.setTimeout(5000, () => {
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
    process.env.NEXT_PUBLIC_WOLO_RPC_URL ||
    woloChainConfig.rpc
  );
}

function getRestSource() {
  return (
    process.env.WOLO_INTERNAL_REST_URL ||
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
    process.env.NEXT_PUBLIC_WOLO_RPC_URL?.trim() ||
    "http://127.0.0.1:26657"
  );
}

async function fetchWoloBalanceAmountFromCli(address: string) {
  const { stdout } = await execFileAsync(
    getQueryCliPath(),
    [
      "query",
      "bank",
      "balances",
      address,
      "--home",
      getQueryCliHome(),
      "--node",
      getQueryCliNode(),
      "--output",
      "json",
    ],
    {
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
    }
  );

  const payload = JSON.parse(stdout) as BankBalancesPayload;
  return payload.balances?.find((coin) => coin.denom === WOLO_BASE_DENOM)?.amount || "0";
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
    `[${stamp}] height ${snapshot.latestBlockHeight} peers ${snapshot.peers} sync ${snapshot.catchingUp ? "catching_up" : "ready"}`,
    `[${stamp}] block_hash ${trimHash(snapshot.latestBlockHash)}`,
    `[${stamp}] app_hash ${trimHash(snapshot.latestAppHash)}`,
    `[${stamp}] validator ${trimHash(snapshot.validatorAddress)}`,
    `[${stamp}] last_block ${snapshot.latestBlockTime || "unknown"}`,
    `[${stamp}] rail armed for next state transition`,
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
      latestBlockTime: payload.result?.sync_info?.latest_block_time || null,
      peers: Number.parseInt(String(netInfo?.result?.n_peers ?? "0"), 10) || 0,
      catchingUp: Boolean(payload.result?.sync_info?.catching_up),
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
      peers: 0,
      catchingUp: false,
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
        `[offline] chain truth still mounted: ${WOLO_CHAIN_ID} / ${WOLO_BASE_DENOM} / ${WOLO_ADDRESS_PREFIX}1...`,
        `[offline] waiting for next successful node handshake`,
      ],
    };
  }
}

export async function fetchWoloBalanceAmount(address: string) {
  const trimmed = address.trim();

  if (!trimmed) {
    throw new Error("Address is required.");
  }

  if (!trimmed.startsWith(`${WOLO_ADDRESS_PREFIX}1`)) {
    throw new Error(`Address must start with ${WOLO_ADDRESS_PREFIX}1`);
  }

  const restSource = getRestSource();

  try {
    const payload = await requestJson<BankBalancesPayload>(
      `${restSource.replace(/\/$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(trimmed)}`
    );

    return payload.balances?.find((coin) => coin.denom === WOLO_BASE_DENOM)?.amount || "0";
  } catch {
    return fetchWoloBalanceAmountFromCli(trimmed);
  }
}
