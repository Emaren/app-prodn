import http from "http";
import https from "https";

import { woloChainConfig } from "@/lib/woloChain";

const insecureHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

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

function trimHash(value: string | null | undefined) {
  if (!value) return "n/a";
  return value.slice(0, 14);
}

function buildTerminalLines(snapshot: Omit<WoloStatusSnapshot, "terminalLines">) {
  const stamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return [
    `[${stamp}] dial rpc ${snapshot.source}`,
    `[${stamp}] chain ${snapshot.chainId} moniker ${snapshot.moniker}`,
    `[${stamp}] height ${snapshot.latestBlockHeight} peers ${snapshot.peers} catching_up ${snapshot.catchingUp ? "yes" : "no"}`,
    `[${stamp}] block_hash ${trimHash(snapshot.latestBlockHash)}`,
    `[${stamp}] app_hash ${trimHash(snapshot.latestAppHash)}`,
    `[${stamp}] validator ${trimHash(snapshot.validatorAddress)}`,
    `[${stamp}] block_time ${snapshot.latestBlockTime || "unknown"}`,
    `[${stamp}] watcher armed for next block`,
  ];
}

export async function fetchWoloStatusSnapshot(): Promise<WoloStatusSnapshot> {
  const source = woloChainConfig.rpc;

  try {
    const [payload, netInfo] = await Promise.all([
      requestJson<TendermintStatusPayload>(`${source.replace(/\/$/, "")}/status`),
      requestJson<TendermintNetInfoPayload>(`${source.replace(/\/$/, "")}/net_info`).catch(() => null),
    ]);
    const network = payload.result?.node_info?.network || woloChainConfig.chainId;
    const moniker = payload.result?.node_info?.moniker || "WoloChain";
    const nodeVersion = payload.result?.node_info?.version || "unknown";
    const latestBlockHeight = payload.result?.sync_info?.latest_block_height || "0";
    const latestBlockTime = payload.result?.sync_info?.latest_block_time || null;
    const catchingUp = Boolean(payload.result?.sync_info?.catching_up);
    const latestBlockHash = payload.result?.sync_info?.latest_block_hash || null;
    const latestAppHash = payload.result?.sync_info?.latest_app_hash || null;
    const peers = Number.parseInt(String(netInfo?.result?.n_peers ?? "0"), 10) || 0;
    const validatorAddress = payload.result?.validator_info?.address || null;

    const snapshotWithoutLines: Omit<WoloStatusSnapshot, "terminalLines"> = {
      healthy: true,
      chainId: network,
      moniker,
      nodeVersion,
      latestBlockHeight,
      latestBlockTime,
      peers,
      catchingUp,
      validatorAddress,
      latestBlockHash,
      latestAppHash,
      source,
    };

    return {
      ...snapshotWithoutLines,
      terminalLines: buildTerminalLines(snapshotWithoutLines),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown node error";
    const fallback: Omit<WoloStatusSnapshot, "terminalLines"> = {
      healthy: false,
      chainId: woloChainConfig.chainId,
      moniker: "WoloChain",
      nodeVersion: "unknown",
      latestBlockHeight: "0",
      latestBlockTime: null,
      peers: 0,
      catchingUp: false,
      validatorAddress: null,
      latestBlockHash: null,
      latestAppHash: null,
      source,
    };

    return {
      ...fallback,
      terminalLines: [
        `[offline] dial rpc ${source}`,
        `[offline] ${detail}`,
        `[offline] chain rail still mounted in builder mode`,
        `[offline] waiting for next successful node handshake`,
      ],
    };
  }
}

export async function fetchWoloBalanceAmount(address: string) {
  const payload = await requestJson<BankBalancesPayload>(
    `${woloChainConfig.rest.replace(/\/$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`
  );

  return (
    payload.balances?.find((coin) => coin.denom === "uwolo")?.amount ||
    "0"
  );
}
