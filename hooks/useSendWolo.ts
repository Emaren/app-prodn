// hooks/useSendWolo.ts

import { useCallback, useState } from "react";
import { SigningStargateClient } from "@cosmjs/stargate";
import { wolochain } from "../config/wolochain";

export function useSendWolo(provider: any /* WalletConnect provider */) {
  const [inProgress, setInProgress] = useState(false);
  const [txResult, setTxResult] = useState<any>(null);
  const [error, setError] = useState<string>();

  const send = useCallback(
    async (recipient: string, amountWolo: number) => {
      if (!provider) throw new Error("WalletConnect provider missing");
      setInProgress(true);
      setError(undefined);

      // Build a simple Amino signer wrapper
      const signer = {
        signAmino: async (signerAddress: string, signDoc: any) =>
          provider.request({
            method: "cosmos_signAmino",
            params: [signerAddress, signDoc],
          }),
        getAccounts: async () => {
          const accounts: string[] = await provider.request({ method: "eth_accounts" });
          return accounts.map((address) => ({
            address,
            algo: "secp256k1",
            pubkey: new Uint8Array(), // optional
          }));
        },
      };

      try {
        const client = await SigningStargateClient.connectWithSigner(
          wolochain.rpcUrl,
          signer as any
        );
      
        const accounts = await signer.getAccounts();
      
        const sendAmount = {
          denom: wolochain.stakeCurrency.coinMinimalDenom, // ✅ nested path
          amount: Math.round(amountWolo * 1e6).toString(),
        };
      
        const res = await client.sendTokens(
          accounts[0].address, // ✅ properly awaited
          recipient,
          [sendAmount],
          "auto"
        );
      
        setTxResult(res);
      } catch (err: any) {
        setError(err.message || "Broadcast failed");
      } finally {
        setInProgress(false);
      }      
    },
    [provider]
  );

  return { send, inProgress, txResult, error };
}
