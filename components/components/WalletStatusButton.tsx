// components/WalletStatusButton.tsx
"use client";

import React from "react";
import { useKeplr } from "@/hooks/use-keplr";

export default function WalletStatusButton() {
  const { address, status, connect, disconnect } = useKeplr();

  if (status === "connected") {
    return (
      <button
        onClick={disconnect}
        className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-800 text-white"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 text-white"
    >
      Connect Wallet
    </button>
  );
}
