"use client";
import {BET_MAX_STAKE_WOLO,AUTO_BET_MAX_DAILY_WOLO} from "@/lib/betMoneyLimits";
import { useEffect, useState } from "react";

type Keplr = {
  signArbitrary(chainId: string, wallet: string, message: string): Promise<{
    pub_key: { type: string; value: string }; signature: string;
  }>;
};
type Mandate = {
  available?: boolean; signed?: boolean; canRevoke?: boolean; expiresAtUtc?: string | null;
  detail?: string;
};

async function parse(response: Response): Promise<Record<string, unknown>> {
  const raw: unknown = await response.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Server mandate response unavailable");
  return raw as Record<string, unknown>;
}
async function send(method: "POST" | "PUT" | "DELETE", payload?: unknown) {
  const response = await fetch("/api/user/war-satchel/auto-consent", {
    method, cache: "no-store", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await parse(response);
  if (!response.ok) throw Error(String(body.detail || "Keplr mandate is not authorized."));
  return body;
}

export default function WarSatchelSpendAuthorization({
  walletAddress, presetVersion, plannedStakeWolo,
}: {
  walletAddress: string;
  presetVersion: number;
  plannedStakeWolo: number;
}) {
  const [available, setAvailable] = useState(false);
  const [signed, setSigned] = useState(false);
  const [canRevoke, setCanRevoke] = useState(false);
  const [expires, setExpires] = useState<string | null>(null);
  const [dailyCap, setDailyCap] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let open = true;
    setAvailable(false); setSigned(false); setCanRevoke(false); setExpires(null); setDetail("");
    // Revocation uses the authenticated owner session, even after Keplr is
    // disconnected or the current plan is removed. Issuance still needs both.
    void fetch("/api/user/war-satchel/auto-consent", {
      cache: "no-store", credentials: "same-origin",
    }).then(parse).then((data: Mandate) => {
      if (!open) return;
      setAvailable(data.available === true);
      setSigned(data.signed === true);
      setCanRevoke(data.canRevoke === true);
      setExpires(typeof data.expiresAtUtc === "string" ? data.expiresAtUtc : null);
    }).catch(() => { if (open) setAvailable(false); });
    return () => { open = false; };
  }, [walletAddress, presetVersion]);

  const cap = /^\d+$/.test(dailyCap.trim()) ? Number(dailyCap.trim()) : NaN;
  const valid = Number.isSafeInteger(presetVersion) && presetVersion > 0 &&
    Number.isSafeInteger(cap) && cap >= plannedStakeWolo &&
    cap <= AUTO_BET_MAX_DAILY_WOLO && plannedStakeWolo > 0 && plannedStakeWolo <= BET_MAX_STAKE_WOLO;
  const authorize = async () => {
    if (busy || signed || !available || !valid || !walletAddress) return;
    setBusy(true); setDetail("");
    try {
      const challenge = await send("POST", { dailyCapWolo: cap, expectedPresetVersion: presetVersion });
      if (challenge.chainId !== "wolo-1" || challenge.walletAddress !== walletAddress ||
          typeof challenge.message !== "string" ||
          !challenge.message.includes("War Satchel Mecha AUTO BET SPENDING AUTHORIZATION") ||
          !challenge.message.includes("Exact preset version: " + presetVersion) ||
          !challenge.message.includes("MAX daily WOLO: " + cap) ||
          typeof challenge.challengeId !== "string" ||
          typeof challenge.expiresAtUtc !== "string" ||
          Date.parse(challenge.expiresAtUtc) <= Date.now()) {
        throw Error("The signed mandate does not match this saved Mecha plan.");
      }
      const keplr = (window as unknown as { keplr?: Keplr }).keplr;
      if (!keplr?.signArbitrary) throw Error("Keplr ADR-36 signing unavailable.");
      const signature = await keplr.signArbitrary("wolo-1", walletAddress, challenge.message);
      const completed = await send("PUT", {
        challengeId: challenge.challengeId, keplrSignature: signature,
      });
      if (completed.signed !== true || completed.autoBetSpendConsent !== true) {
        throw Error("The mandate was not verified by the server.");
      }
      setSigned(true);
      setCanRevoke(true);
      setExpires(typeof challenge.spendingExpiresAtUtc === "string" ? challenge.spendingExpiresAtUtc : null);
      setDetail("Spending authorization signed. Funded bets remain unavailable until the vault and execution service are certified.");
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "Authorization failed.");
    } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (busy || (!canRevoke && !signed)) return;
    setBusy(true); setDetail("");
    try {
      await send("DELETE");
      setSigned(false); setCanRevoke(false); setExpires(null);
      setDetail("Keplr spending mandate revoked. No new automatic wagers are authorized.");
    } catch (error) {
      setDetail(error instanceof Error ? error.message : "Revocation unavailable.");
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-4 rounded-xl border border-sky-200/25 bg-sky-200/[.045] p-4">
      <h4 className="text-sm font-black uppercase text-sky-100">Signed Keplr auto-bet permission</h4>
      <p className="mt-2 text-xs text-slate-300">
        A saved bet plan is not permission to spend WOLO. Keplr signs the exact
        game amount, version and daily allowance. You can revoke it anytime.
        This never gives the website your Keplr private key.
      </p>
      {signed && expires ? (
        <p className="mt-2 text-xs text-emerald-200">
          Authorization signed · expires {new Date(expires).toLocaleString()}
        </p>
      ) : (
        <label className="mt-3 block text-xs text-slate-300">
          Maximum daily automatic bets (WOLO)
          <input aria-label="Signed maximum daily WOLO" type="number" inputMode="numeric"
            min={plannedStakeWolo > 0 ? plannedStakeWolo : 1} max={AUTO_BET_MAX_DAILY_WOLO}
            value={dailyCap} onChange={e => setDailyCap(e.target.value)}
            className="mt-1 block w-36 rounded-lg border border-white/20 bg-slate-950 p-2 text-white" />
        </label>
      )}
      <button type="button" onClick={() => void ((signed || canRevoke) ? revoke() : authorize())}
        disabled={busy || (!(signed || canRevoke) && (!available || !valid || !walletAddress))}
        className="mt-3 rounded-lg border border-sky-300/40 p-3 text-xs font-bold text-sky-100 disabled:opacity-40">
        {busy ? "VERIFYING..." : (signed || canRevoke) ? "REVOKE AUTO-BET PERMISSION" :
          available ? "SIGN AUTO-BET LIMITS WITH KEPLR" : "SIGNED MANDATE NOT YET ENABLED"}
      </button>
      {detail && <p role="status" className="mt-2 text-xs text-amber-200">{detail}</p>}
    </section>
  );
}
