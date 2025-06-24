// app/connect-wallet/page.tsx
"use client";

import React from "react";
import WalletConnector from "@/components/WalletConnector";

export default function ConnectWalletPage() {
  return (
    <main className="p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Connect Your Wallet</h1>
      <WalletConnector />
    </main>
  );
}
