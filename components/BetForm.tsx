// components/BetForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useKeplr } from "../hooks/use-keplr";
import { SigningStargateClient } from "@cosmjs/stargate";
import { useWoloChainConfig } from "../config/wolochain"; // assumes you export rpc & denom info
import { useWcConnector } from "../hooks/useWcConnector"; // a small hook that returns the `wc` instance

type RequestPayload = {
  method: string;
  params?: unknown[];
};

type ProviderWithRequest = {
  request: (payload: RequestPayload) => Promise<unknown>;
};

type WalletConnectLike = {
  sendCustomRequest: (payload: RequestPayload) => unknown;
};

type AminoSignDoc = Record<string, unknown>;
type StargateSigner = Parameters<typeof SigningStargateClient.connectWithSigner>[1];

export function BetForm() {
  const { address: keplrAddr, status } = useKeplr();
  const wcConnector = useWcConnector(); // { connector, accounts }
  const [provider, setProvider] = useState<ProviderWithRequest | null>(null);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(0);
  const [inProgress, setInProgress] = useState(false);
  const [txHash, setTxHash] = useState<string>();
  const [error, setError] = useState<string>();

  const { rpc, coinMinimalDenom } = useWoloChainConfig();

  // pick provider on client only
  useEffect(() => {
    if (typeof window === "undefined") return;
    const keplrWindow = window as Window & {
      keplr?: { request?: ProviderWithRequest["request"] };
    };

    if (keplrWindow.keplr?.request && status === "connected") {
      const keplrRequest = keplrWindow.keplr.request.bind(keplrWindow.keplr);
      setProvider({ request: keplrRequest });
    } else if (wcConnector.connector && wcConnector.accounts.length) {
      const connector = wcConnector.connector as unknown as WalletConnectLike;
      setProvider({
        request: async ({ method, params = [] }: RequestPayload) =>
          Promise.resolve(connector.sendCustomRequest({ method, params })),
      });
    } else {
      setProvider(null);
    }
  }, [status, wcConnector.connector, wcConnector.accounts]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider) return;
    setInProgress(true);
    setError(undefined);

    // wrap provider into Amino signer
    const signer = {
      signAmino: async (signerAddress: string, signDoc: AminoSignDoc) =>
        provider.request({ method: "cosmos_signAmino", params: [signerAddress, signDoc] }),
      getAccounts: async () => {
        const accountResponse = await provider.request({ method: "eth_accounts" });
        const accts = Array.isArray(accountResponse)
          ? accountResponse.filter((addr): addr is string => typeof addr === "string")
          : [];
        return accts.map((addr) => ({ address: addr, algo: "secp256k1", pubkey: new Uint8Array() }));
      },
    };

    try {
      const fromAddress = keplrAddr || wcConnector.accounts[0];
      if (!fromAddress) {
        throw new Error("No connected wallet account found");
      }

      const client = await SigningStargateClient.connectWithSigner(
        rpc,
        signer as unknown as StargateSigner
      );
      const res = await client.sendTokens(
        fromAddress,
        to,
        [{ denom: coinMinimalDenom, amount: Math.round(amount * 1e6).toString() }],
        "auto"
      );
      setTxHash(res.transactionHash);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to broadcast");
    } finally {
      setInProgress(false);
    }
  };

  if (!provider) return null;

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4 bg-gray-800 rounded">
      <h2 className="text-lg font-semibold">Place a Bet</h2>
      <div>
        <label>To:</label>
        <input
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full p-2 rounded bg-gray-700"
          required
        />
      </div>
      <div>
        <label>Amount (Wolo):</label>
        <input
          type="number"
          step="0.000001"
          value={amount}
          onChange={(e) => setAmount(+e.target.value)}
          className="w-full p-2 rounded bg-gray-700"
          required
        />
      </div>
      <button
        type="submit"
        disabled={inProgress}
        className={`px-4 py-2 rounded ${
          inProgress ? "bg-gray-600" : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {inProgress ? "Sending…" : "Place Bet"}
      </button>
      {error && <p className="text-red-400">Error: {error}</p>}
      {txHash && <p className="text-green-400">Tx Hash: {txHash}</p>}
    </form>
  );
}
