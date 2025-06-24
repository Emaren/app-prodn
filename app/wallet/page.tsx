// app/wallet/page.tsx
"use client";

import React from "react";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";

export default function WalletPage() {
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading } = useWoloBalance(address);
  const formatted = rawBalance ? (parseFloat(rawBalance) / 1_000_000).toFixed(2) : "0.00";

  return (
    <main className="p-6 bg-gray-900 text-white min-h-screen">
      <h1 className="text-3xl font-bold mb-6">🪙 My Wallet</h1>

      {/* Status and Address */}
      <div className="mb-6">
        <p><strong>Status:</strong> {status}</p>
        <p><strong>Address:</strong> <span className="break-all">{address || "Not connected"}</span></p>
        {!address && (
          <button
            onClick={connect}
            className="mt-4 px-4 py-2 bg-blue-700 rounded-md hover:bg-blue-600"
          >
            Connect Keplr
          </button>
        )}
      </div>

      {/* Balance */}
      <div className="bg-gray-800 p-4 rounded-xl shadow-lg text-xl mb-6">
        <p><strong>Balance:</strong> {isLoading ? "Loading..." : `${formatted} WOLO`}</p>
      </div>

      {/* Wallet Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <button className="p-4 bg-green-700 rounded-lg shadow hover:bg-green-600 w-full">
          📈 Stake Tokens
        </button>
        <button className="p-4 bg-yellow-700 rounded-lg shadow hover:bg-yellow-600 w-full">
          💸 Claim Rewards
        </button>
        <button className="p-4 bg-purple-700 rounded-lg shadow hover:bg-purple-600 w-full">
          📜 View Transaction History
        </button>
        <button className="p-4 bg-pink-700 rounded-lg shadow hover:bg-pink-600 w-full">
          🔐 Manage Keys
        </button>
        <button className="p-4 bg-indigo-700 rounded-lg shadow hover:bg-indigo-600 w-full">
          🔄 Refresh Balance
        </button>
      </div>
    </main>
  );
}
