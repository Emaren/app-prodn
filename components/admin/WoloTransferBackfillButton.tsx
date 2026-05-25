"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

type BackfillResult = {
  ok?: boolean;
  result?: {
    latestHeight: number;
    fromHeight: number;
    addressCount: number;
    queriesAttempted: number;
    txsSeen: number;
    transfersParsed: number;
    created: number;
    updated: number;
    errors?: string[];
  };
  detail?: string;
};

export default function WoloTransferBackfillButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function runBackfill() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/wolo-transfers/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockLimit: 20_000,
          addressLimit: 80,
          perAddressLimit: 20,
          globalLimit: 25,
        }),
      });
      const payload = (await response.json().catch(() => null)) as BackfillResult | null;

      if (!response.ok || !payload?.result) {
        setMessage(payload?.detail || `Backfill failed with HTTP ${response.status}.`);
        return;
      }

      const result = payload.result;
      setMessage(
        `Indexed ${result.created} new, refreshed ${result.updated}; ${result.transfersParsed} direct transfers parsed from ${result.txsSeen} txs.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backfill failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={runBackfill}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-50 transition hover:border-emerald-200/55 hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Scanning mainnet" : "Backfill direct transfers"}
      </button>
      {message ? <div className="max-w-sm text-xs leading-5 text-emerald-100/80">{message}</div> : null}
    </div>
  );
}
