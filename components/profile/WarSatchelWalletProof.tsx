"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

type SignedArbitrary = {
  pub_key: { type: string; value: string };
  signature: string;
};
type KeplrWallet = { signArbitrary?: (
  chainId: string, signer: string, message: string
) => Promise<SignedArbitrary> };
type OwnershipChallenge = {
  challengeId: string; chainId: string; walletAddress: string;
  message: string; expiresAtUtc: string;
  custodyApproved: false; creditAuthorized: false;
};
type ProofOutcome = {
  walletControlVerified?: boolean;
  walletAddress?: string;
  custodyApproved?: boolean;
  creditAuthorized?: boolean;
  wagerAuthorized?: boolean;
  detail?: string;
};

function currentKeplr(): KeplrWallet | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { keplr?: KeplrWallet }).keplr;
}
async function jsonReply(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Wallet verification response invalid.");
  }
  return body as Record<string, unknown>;
}

/** Gate C2: off-chain signature proof only, no funds move or wagers. */
export default function WarSatchelWalletProof({ walletAddress }: { walletAddress: string }) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setAvailable(false); setVerified(false); setError("");
    if (!walletAddress) return;
    void fetch("/api/user/war-satchel/wallet-proof", {
      cache: "no-store", credentials: "same-origin",
    }).then(jsonReply).then(data => {
      if (!cancelled) setAvailable(
        data.available === true && data.walletAddress === walletAddress &&
        data.creditAuthorized === false && data.custodyApproved === false
      );
    }).catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, [walletAddress]);

  const proveControl = async () => {
    if (busy || verified || !available || !walletAddress) return;
    setBusy(true); setError("");
    try {
      const wallet = currentKeplr();
      if (!wallet?.signArbitrary) throw new Error("Keplr ADR-36 message signing unavailable.");
      const response = await fetch("/api/user/war-satchel/wallet-proof", {
        method: "POST", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const obj = await jsonReply(response);
      if (!response.ok) throw new Error(String(obj.detail || "Wallet challenge unavailable."));
      const challenge = obj as unknown as OwnershipChallenge;
      if (challenge.chainId !== "wolo-1" ||
          challenge.walletAddress !== walletAddress ||
          typeof challenge.challengeId !== "string" ||
          typeof challenge.message !== "string" ||
          !challenge.message.includes("Purpose: satchel-v1:owner-proof") ||
          !Number.isFinite(Date.parse(challenge.expiresAtUtc)) ||
          Date.parse(challenge.expiresAtUtc) <= Date.now() ||
          challenge.custodyApproved !== false || challenge.creditAuthorized !== false) {
        throw new Error("Server challenge does not match linked Keplr wallet.");
      }
      const keplrSignature = await wallet.signArbitrary("wolo-1", walletAddress, challenge.message);
      if (!keplrSignature?.signature || !keplrSignature.pub_key?.value) {
        throw new Error("Keplr did not return an ADR-36 signature.");
      }
      const outcome = await fetch("/api/user/war-satchel/wallet-proof", {
        method: "PUT", cache: "no-store", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId, keplrSignature }),
      });
      const result = await jsonReply(outcome) as ProofOutcome;
      if (!outcome.ok || result.walletControlVerified !== true ||
          result.walletAddress !== walletAddress ||
          result.custodyApproved !== false || result.creditAuthorized !== false ||
          result.wagerAuthorized !== false) {
        throw new Error(result.detail || "Wallet ownership proof refused.");
      }
      setVerified(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet verification failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!available) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200/25 bg-sky-200/[.045] p-3">
      <span className="inline-flex items-center gap-2 text-xs font-bold text-sky-100">
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {verified ? "KEPLR CONTROL VERIFIED · 0 WOLO MOVED" : "PROVE KEPLR CONTROL · 0 WOLO MOVED"}
      </span>
      <button type="button" onClick={() => void proveControl()} disabled={busy || verified}
        className="rounded-lg border border-sky-200/40 px-3 py-2 text-xs font-black text-sky-100 disabled:opacity-40">
        {busy ? "SIGNING..." : verified ? "VERIFIED" : "VERIFY WALLET"}
      </button>
      {error && <p role="alert" className="w-full text-xs text-rose-200">{error}</p>}
    </div>
  );
}
