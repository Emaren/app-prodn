"use client";

import { useEffect, useState } from "react";
import {parseCertifiedWarSatchelRead} from "@/lib/warSatchelBalanceRead";

type Keplr = {
  enable(chainId: string): Promise<void>;
  getOfflineSigner(chainId: string): import("@cosmjs/proto-signing").OfflineSigner;
};
type Balance = {
  available: boolean;
  depositEnabled: boolean;
  availableUwolo: string;
  reservedUwolo: string;
  withdrawalPendingUwolo: string;
};
type FundingQuote = {
  enabled: true;
  chainId: "wolo-1";
  denom: "uwolo";
  ownerWalletAddress: string;
  recipientAddress: string;
  amountUwolo: string;
  memo: string;
  intentId: string;
  expiresAtUtc: string;
};
const ADDR = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const TX_HASH = /^[A-F0-9]{64}$/;

async function reply(response: Response) {
  const json: unknown = await response.json().catch(() => null);
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Satchel server returned an unreadable response.");
  }
  return json as Record<string, unknown>;
}
async function postJson(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await reply(response);
  if (!response.ok) throw new Error(String(body.detail || "Satchel operation unavailable."));
  return body;
}
function quoteValid(data: unknown, walletAddress: string, amountWolo: number): data is FundingQuote {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const q = data as Record<string, unknown>;
  const amount = BigInt(amountWolo) * BigInt(1000000);
  return q.enabled === true && q.chainId === "wolo-1" && q.denom === "uwolo" &&
    q.ownerWalletAddress === walletAddress &&
    typeof q.recipientAddress === "string" && ADDR.test(q.recipientAddress) &&
    q.recipientAddress !== walletAddress &&
    q.amountUwolo === amount.toString() &&
    typeof q.memo === "string" && /^aoe2war\/satchel\/v1\//.test(q.memo) &&
    q.memo.length <= 240 &&
    typeof q.intentId === "string" &&
    typeof q.expiresAtUtc === "string" &&
    Number.isFinite(Date.parse(q.expiresAtUtc)) &&
    Date.parse(q.expiresAtUtc) > Date.now();
}
function wolo(raw: string) {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(raw)) return "—";
  const amount = BigInt(raw);
  const whole = (amount / BigInt(1000000)).toLocaleString();
  const fraction = String(amount % BigInt(1000000)).padStart(6,"0").replace(/0+$/,"");
  return whole + (fraction ? "." + fraction : "");
}

/**
 * Real Keplr transaction flow, but only when backend confirms all audited
 * custody and withdrawal release gates. Browser never holds a server key.
 * Any ambiguous transfer stays pending; the UI never retries signing.
 */
export default function WarSatchelFundingAction({
  walletAddress, depositAmount,
}: {
  walletAddress: string;
  depositAmount: string;
}) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [intentId, setIntentId] = useState("");
  const [detail, setDetail] = useState("");
  const [credited, setCredited] = useState(false);
  const [knownIntents, setKnownIntents] = useState<Array<{id:string;amountUwolo:string;createdAtUtc:string}>>([]);
  const [recoveryIntent, setRecoveryIntent] = useState("");
  const [recoveryHash, setRecoveryHash] = useState("");
  const [mayHaveSent, setMayHaveSent] = useState(false);

  const refreshBalance = async () => {
    setBalance(null);
    const response = await fetch("/api/user/war-satchel/balance", {
      credentials: "same-origin", cache: "no-store",
    });
    const data = await reply(response);
    if (!response.ok) { setBalance(null); return; }
    const ledger=parseCertifiedWarSatchelRead(data);
    setBalance(ledger?{available:true,depositEnabled:data.depositEnabled===true,...ledger}:null);
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/user/war-satchel/balance", {
      credentials: "same-origin", cache: "no-store",
    }).then(async response => response.ok?reply(response):null).then(data => {
      if (!active) return;
      const ledger=parseCertifiedWarSatchelRead(data);
      setBalance(ledger?{available:true,depositEnabled:data?.depositEnabled===true,...ledger}:null);
    }).catch(() => { if (active) setBalance(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setKnownIntents([]); setRecoveryIntent(""); setRecoveryHash("");
    if (!walletAddress) return;
    void fetch("/api/user/war-satchel/funding-intents", {
      credentials: "same-origin", cache: "no-store",
    }).then(reply).then(data => {
      if (!active || data.available !== true || !Array.isArray(data.recentIntents)) return;
      const recovered = data.recentIntents.filter(item => {
        if (!item || typeof item !== "object") return false;
        const v = item as Record<string, unknown>;
        return typeof v.id === "string" &&
          /^[a-f0-9-]{36}$/i.test(v.id) &&
          typeof v.amountUwolo === "string" &&
          typeof v.createdAtUtc === "string";
      }).slice(0, 5).map(item => {
        const v = item as Record<string, unknown>;
        return {id: String(v.id), amountUwolo: String(v.amountUwolo),
          createdAtUtc: String(v.createdAtUtc)};
      });
      setKnownIntents(recovered);
      setRecoveryIntent(recovered[0]?.id || "");
    }).catch(() => {});
    return () => {active = false;};
  }, [walletAddress]);

  const amount = /^\d+$/.test(depositAmount.trim()) ? Number(depositAmount.trim()) : NaN;
  const valid = Number.isSafeInteger(amount) && amount >= 1 && amount <= 10000;
  const ready = balance?.available === true && balance.depositEnabled === true &&
    Boolean(walletAddress && ADDR.test(walletAddress));

  const sendFromKeplr = async () => {
    if (busy || !ready || !valid || txHash || mayHaveSent ||
        knownIntents.length > 0) return;
    setBusy(true); setDetail(""); setCredited(false);
    try {
      // Server mints an owner-linked memo and exact amount; a client cannot
      // substitute a recipient or pre-credit a user balance.
      const prepared = await postJson("/api/user/war-satchel/funding-intents",
        { amountWolo: String(amount) });
      if (typeof prepared.id !== "string") throw Error("Deposit intent unavailable.");
      const quoteRaw = await postJson("/api/user/war-satchel/funding-quote",
        { intentId: prepared.id });
      if (!quoteValid(quoteRaw, walletAddress, amount)) {
        throw Error("Keplr transfer quote does not match your wallet or amount.");
      }
      const quote = quoteRaw;
      // The intent ID must survive even if Keplr accepts a transaction but
      // the browser loses its HTTP response. Never discard it on timeout.
      setIntentId(quote.intentId);
      setKnownIntents(current => current.some(x => x.id === quote.intentId) ?
        current : [{
          id: quote.intentId, amountUwolo: quote.amountUwolo,
          createdAtUtc: new Date().toISOString(),
        }, ...current].slice(0,5));
      setRecoveryIntent(quote.intentId);
      const keplr = (window as unknown as { keplr?: Keplr }).keplr;
      if (!keplr?.enable || !keplr.getOfflineSigner) {
        throw Error("Keplr extension is not installed or the Wolo chain is unavailable.");
      }
      await keplr.enable("wolo-1");
      const signer = keplr.getOfflineSigner("wolo-1");
      const accounts = await signer.getAccounts();
      if (accounts.length !== 1 || accounts[0].address !== walletAddress) {
        throw Error("Keplr signer account changed. No transfer submitted.");
      }
      if (Date.parse(quote.expiresAtUtc) <= Date.now()) {
        throw Error("Prepared transfer expired. No transfer submitted.");
      }
      const { SigningStargateClient } = await import("@cosmjs/stargate");
      const client = await SigningStargateClient.connectWithSigner(
        "https://rpc-mainnet.aoe2war.com", signer,
      );
      try {
        // The wallet extension shows this transfer for explicit confirmation.
        // A returned success is NOT yet an account credit.
        // Mark uncertain BEFORE signing: even an exception can follow an
        // on-chain send. Never offer a repeat-send button for this intent.
        setMayHaveSent(true);
        const result = await client.sendTokens(
          walletAddress, quote.recipientAddress,
          [{ denom: "uwolo", amount: quote.amountUwolo }],
          { amount: [{ denom: "uwolo", amount: "5000" }], gas: "200000" },
          quote.memo,
        );
        if (result.code !== 0 || !TX_HASH.test(result.transactionHash.toUpperCase())) {
          throw Error("Keplr did not confirm a successful Wolo transaction.");
        }
        setTxHash(result.transactionHash.toUpperCase());
        setIntentId(quote.intentId);
        setDetail("Transfer broadcast. Keep the hash; verify it after three chain confirmations. Do not resend.");
      } finally {
        client.disconnect();
      }
    } catch (e) {
      setDetail(e instanceof Error ? e.message : "Keplr transfer was not completed. Check chain history before retrying.");
    } finally { setBusy(false); }
  };

  const verifyAndCredit = async () => {
    if (busy || !txHash || !intentId || credited) return;
    setBusy(true); setDetail("");
    try {
      const proof = await postJson("/api/user/war-satchel/deposit-evidence",
        { intentId, txHash });
      if (proof.receiptKey !== "wolo-1:" + txHash + ":0") {
        throw Error("Recorded chain proof does not match your transaction.");
      }
      const result = await postJson("/api/user/war-satchel/credit-verified",
        { intentId, txHash });
      if (result.credited !== true) throw Error("Your deposit has not been credited.");
      setCredited(true);
      // Successfully credited receipt is no longer an unfinished transfer.
      // Other unresolved intents remain visible and MUST NOT be resent.
      setKnownIntents(current => current.filter(x => x.id !== intentId));
      setDetail("Canonical WOLO credit recorded. Your War Satchel balance is reconciled.");
      await refreshBalance();
    } catch (error) {
      setDetail((error instanceof Error ? error.message : "Confirmation pending.") +
        " Your transfer may already be on chain. Do not send it again.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 space-y-3 text-sm text-slate-200">
      {balance?.available ? (
        <p>
          Verified War Satchel: <strong>{wolo(balance.availableUwolo)} WOLO available</strong>
          {" · "}{wolo(balance.reservedUwolo)} reserved
          {" · "}{wolo(balance.withdrawalPendingUwolo)} pending withdrawal
        </p>
      ) : (
        <p>War Satchel funding is not certified for production. No deposit address will be shown until withdrawals and custody are safe.</p>
      )}
      {!txHash && (
        <button type="button" disabled={busy || !ready || !valid || mayHaveSent ||
          knownIntents.length > 0} onClick={() => void sendFromKeplr()}
          className="rounded-xl border border-amber-300/40 px-4 py-3 font-bold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "CONFIRMING WITH KEPLR..." : ready ? "TRANSFER WOLO FROM KEPLR" : "FUNDING AWAITING VAULT CERTIFICATION"}
        </button>
      )}
      {knownIntents.length > 0 && !txHash && (
        <div className="space-y-2 rounded-xl border border-sky-200/25 p-3">
          <p className="font-semibold text-sky-100">Recover a Keplr deposit</p>
          <p className="text-xs text-slate-300">
            A transfer may already be on WoloChain. Find the original
            transaction hash in Keplr history. Do not send the funds again.
          </p>
          <label className="block text-xs text-slate-200">
            Original deposit intent
            <select value={recoveryIntent} onChange={e => setRecoveryIntent(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950 p-2 text-white">
              {knownIntents.map(item => <option key={item.id} value={item.id}>
                {wolo(item.amountUwolo)} WOLO · {item.id}
              </option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-200">
            Original WoloChain transaction hash
            <input value={recoveryHash} onChange={e => setRecoveryHash(e.target.value.trim())}
              maxLength={64} spellCheck={false} autoComplete="off"
              placeholder="64-character transaction hash"
              className="mt-1 w-full rounded-lg border border-white/20 bg-slate-950 p-2 font-mono text-xs text-white"/>
          </label>
          <button type="button"
            disabled={busy || !TX_HASH.test(recoveryHash.toUpperCase()) ||
              !knownIntents.some(item => item.id === recoveryIntent)}
            onClick={() => {
              setIntentId(recoveryIntent);
              setTxHash(recoveryHash.toUpperCase());
              setDetail("Verify the ORIGINAL transfer. No WOLO will be resent.");
            }}
            className="rounded-lg border border-sky-200/40 p-2 font-semibold disabled:opacity-40">
            VERIFY EXISTING TRANSFER — DO NOT RESEND
          </button>
        </div>
      )}
      {txHash && (
        <div className="space-y-2 rounded-xl border border-sky-200/25 p-3">
          <p className="break-all font-mono text-xs">Transaction: {txHash}</p>
          <button type="button" onClick={() => void verifyAndCredit()} disabled={busy || credited}
            className="rounded-lg border border-sky-200/40 p-2 font-semibold disabled:opacity-40">
            {credited ? "CREDIT VERIFIED" : busy ? "VERIFYING CHAIN..." : "VERIFY DEPOSIT & CREDIT SATCHEL"}
          </button>
        </div>
      )}
      {credited && (
        <button type="button" disabled={busy || knownIntents.length > 0}
          onClick={() => {
            setTxHash(""); setIntentId(""); setRecoveryHash("");
            setRecoveryIntent(""); setMayHaveSent(false); setCredited(false);
            setDetail("Previous transfer was verified. You can prepare a new deposit.");
          }}
          className="rounded-lg border border-slate-200/40 p-2 text-xs font-semibold disabled:opacity-40">
          PREPARE ANOTHER DEPOSIT
        </button>
      )}
      {detail && <p role="status" className="text-xs text-amber-200">{detail}</p>}
    </div>
  );
}
