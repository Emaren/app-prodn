import { homedir } from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { LobbyWoloSnapshot, LobbyWoloAccount } from "@/lib/lobby";

type RawWoloAccount = {
  address?: unknown;
  uwolo?: unknown;
  wolo?: unknown;
};

type RawWoloSnapshot = {
  chain_id?: unknown;
  denom?: {
    base?: unknown;
    display?: unknown;
    decimals?: unknown;
  };
  accounts?: Record<string, RawWoloAccount> | unknown;
};

function coerceNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function coerceAccount(value: RawWoloAccount | undefined): LobbyWoloAccount | null {
  if (!value || typeof value.address !== "string" || value.address.length === 0) {
    return null;
  }

  return {
    address: value.address,
    uwolo: coerceNumber(value.uwolo),
    wolo: coerceNumber(value.wolo),
  };
}

export async function loadWoloDevSnapshot(): Promise<LobbyWoloSnapshot | null> {
  const allow = process.env.AOE2_ENABLE_WOLO_DEV_SNAPSHOT === "1";
  if (!allow) return null;

  const filePath =
    process.env.WOLO_LOCAL_BALANCES_FILE ||
    path.join(homedir(), "projects", "WoloChain", "build", "local-balances.json");

  try {
    const [raw, stat] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath),
    ]);

    const parsed = JSON.parse(raw) as RawWoloSnapshot;

    if (
      typeof parsed.chain_id !== "string" ||
      !parsed.denom ||
      typeof parsed.denom.base !== "string" ||
      typeof parsed.denom.display !== "string"
    ) {
      return null;
    }

    const rawAccounts =
      parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {};

    const accounts: Record<string, LobbyWoloAccount> = {};

    for (const [name, value] of Object.entries(rawAccounts)) {
      const account = coerceAccount(value as RawWoloAccount);
      if (account) {
        accounts[name] = account;
      }
    }

    return {
      enabled: true,
      chainId: parsed.chain_id,
      denom: {
        base: parsed.denom.base,
        display: parsed.denom.display,
        decimals: coerceNumber(parsed.denom.decimals),
      },
      source: filePath,
      updatedAt: stat.mtime.toISOString(),
      accounts,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") {
      console.warn("Failed to load local Wolo snapshot:", error);
    }
    return null;
  }
}