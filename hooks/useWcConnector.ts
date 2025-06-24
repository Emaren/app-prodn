// hooks/useWcConnector.ts
"use client";

import { useEffect, useState } from "react";
import WalletConnect from "@walletconnect/client";

export function useWcConnector() {
  const [connector, setConnector] = useState<WalletConnect | null>(null);
  const [accounts, setAccounts] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const wc = new WalletConnect({
      bridge: "https://bridge.walletconnect.org"
    });

    if (wc.connected) {
      setAccounts(wc.accounts);
    }

    wc.on("connect", (_err, payload) => {
      const { accounts } = payload.params[0];
      setAccounts(accounts);
    });

    wc.on("disconnect", () => {
      setAccounts([]);
    });

    setConnector(wc);
  }, []);

  return { connector, accounts };
}
