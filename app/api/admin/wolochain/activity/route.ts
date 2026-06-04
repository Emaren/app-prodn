import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { loadIndexedWoloTransferActivityRows } from "@/lib/woloMainnetTransfers";
import { loadWoloMainnetActivityRows } from "@/lib/woloTransactionRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

type ActivityRailKind =
  | "direct"
  | "stake"
  | "unstake"
  | "wager"
  | "payout"
  | "settlement"
  | "treasury"
  | "faucet"
  | "other";

type ActivityRailRow = {
  key: string;
  kind: ActivityRailKind;
  label: string;
  detail: string;
  amountLabel: string | null;
  txHash: string | null;
  timestamp: string;
  source: string;
};

function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function shortAddress(value: string | null | undefined, lead = 10, tail = 7) {
  if (!value) return null;
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function shortTx(value: string | null | undefined) {
  if (!value) return null;
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function timestampOf(row: ActivityRailRow) {
  const ms = Date.parse(row.timestamp);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeAppKind(actionType: string): ActivityRailKind {
  if (actionType === "stake") return "stake";
  if (actionType === "unstake") return "unstake";
  if (actionType === "bet_challenge_escrow") return "wager";
  if (actionType === "payout_settlement") return "payout";
  if (actionType === "faucet_claim") return "faucet";
  return "other";
}

function kindMatches(row: ActivityRailRow, filter: string) {
  if (filter === "all") return true;
  if (filter === "settlement") return row.kind === "settlement" || row.kind === "payout";
  if (filter === "staking") return row.kind === "stake" || row.kind === "unstake";
  return row.kind === filter;
}

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  const { searchParams } = new URL(request.url);
  const take = clampInt(searchParams.get("take"), 10, 1, 25);
  const offset = clampInt(searchParams.get("offset"), 0, 0, 500);
  const filter = (searchParams.get("filter") || "all").toLowerCase();
  const includeFaucet = searchParams.get("includeFaucet") === "1" || filter === "faucet";

  const { prisma } = gate;

  // Helpers currently expose capped recent lists, so fetch enough to page within the operator rail.
  const helperLimit = Math.max(25, Math.min(80, offset + take + 25));

  const [directRows, appRows] = await Promise.all([
    loadIndexedWoloTransferActivityRows(prisma, helperLimit).catch(() => []),
    loadWoloMainnetActivityRows(prisma, helperLimit).catch(() => []),
  ]);

  const directActivity: ActivityRailRow[] = directRows.map((row) => {
    const sender = row.senderLabel || shortAddress(row.senderAddress) || "Unknown sender";
    const recipient = row.recipientLabel || shortAddress(row.recipientAddress) || "Unknown recipient";
    const tx = shortTx(row.txHash);

    return {
      key: `direct:${row.txHash}:${row.transferIndex}`,
      kind: "direct",
      label: `${row.amountLabel} direct transfer`,
      detail: `${sender} → ${recipient}${tx ? ` · tx ${tx}` : ""}${row.memo ? ` · memo ${row.memo}` : ""}`,
      amountLabel: row.amountLabel,
      txHash: row.txHash,
      timestamp: row.timestamp,
      source: "wolo-indexed-transfer",
    };
  });

  const appActivity: ActivityRailRow[] = appRows.map((row) => {
    const kind = normalizeAppKind(row.actionType);
    const tx = shortTx(row.txHash);
    const wallet = shortAddress(row.walletAddress);
    const actor = row.userLabel || wallet || "App record";
    const amountLabel =
      typeof row.amountWolo === "number" && Number.isFinite(row.amountWolo)
        ? `${row.amountWolo.toLocaleString()} WOLO`
        : null;

    return {
      key: `app:${row.key}`,
      kind,
      label: row.actionLabel,
      detail: `${actor}${row.contextLabel ? ` · ${row.contextLabel}` : ""}${tx ? ` · tx ${tx}` : ""}`,
      amountLabel,
      txHash: row.txHash,
      timestamp: row.updatedAt || row.createdAt,
      source: "app-wolo-activity",
    };
  });

  const txBackedOnly = filter !== "faucet";

  const combined = [...directActivity, ...appActivity]
    .filter((row) => includeFaucet || row.kind !== "faucet")
    .filter((row) => !txBackedOnly || Boolean(row.txHash))
    .filter((row) => kindMatches(row, filter))
    .sort((a, b) => timestampOf(b) - timestampOf(a));

  const rows = combined.slice(offset, offset + take);

  return NextResponse.json(
    {
      ok: true,
      rows,
      nextOffset: offset + rows.length,
      hasMore: offset + rows.length < combined.length,
      totalVisible: combined.length,
      defaultExcludesFaucet: !includeFaucet,
      note:
        "Read-only WoloChain activity rail. Direct transfers come from indexed WoloChain bank sends; default view only shows tx-backed WoloChain activity; faucet and non-tx app records stay out of the main tape.",
    },
    { headers: NO_STORE_HEADERS }
  );
}
