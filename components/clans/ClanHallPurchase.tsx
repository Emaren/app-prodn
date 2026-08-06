"use client";

import { Check, Landmark, Send, Shield, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";

import { payWoloOnChain } from "@/lib/clientMarketplacePayment";
import { WOLO_CHAIN_ID, woloChainConfig } from "@/lib/woloChain";

type PurchaseRequest = {
  publicId: string;
  clanName: string;
  desiredSlug: string;
  foundingMessage: string;
  requesterAddress: string;
  amountWolo: number;
  recipientAddress: string;
  memo: string;
  txHash: string | null;
  paymentStatus: string;
  status: string;
};

type PurchaseSnapshot = {
  ok: boolean;
  ready: boolean;
  priceWolo: number;
  latestRequest: PurchaseRequest | null;
};

type KeplrWindow = Window & {
  keplr?: {
    enable?: (chainId: string) => Promise<void>;
    experimentalSuggestChain?: (config: typeof woloChainConfig) => Promise<void>;
    getKey?: (chainId: string) => Promise<{ bech32Address?: string }>;
  };
};

async function responseJson<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & {
    detail?: string;
  };
  if (!response.ok) throw new Error(payload.detail || "The Clan Hall request failed.");
  return payload;
}

async function connectKeplrAddress() {
  const browser = window as KeplrWindow;
  if (!browser.keplr) throw new Error("Keplr extension not found.");

  if (browser.keplr.experimentalSuggestChain) {
    try {
      await browser.keplr.experimentalSuggestChain(woloChainConfig);
    } catch (error) {
      console.warn("WoloChain suggest failed or already exists:", error);
    }
  }

  await browser.keplr.enable?.(WOLO_CHAIN_ID);
  const key = await browser.keplr.getKey?.(WOLO_CHAIN_ID);
  const address = key?.bech32Address?.trim().toLowerCase() || "";
  if (!/^wolo1[0-9a-z]{20,90}$/.test(address)) {
    throw new Error("Keplr did not return a valid WoloChain address.");
  }
  return address;
}

export default function ClanHallPurchase() {
  const [snapshot, setSnapshot] = useState<PurchaseSnapshot | null>(null);
  const [activeRequest, setActiveRequest] = useState<PurchaseRequest | null>(null);
  const [clanName, setClanName] = useState("");
  const [foundingMessage, setFoundingMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/clans/purchase", { cache: "no-store" })
      .then((response) => responseJson<PurchaseSnapshot>(response))
      .then((payload) => {
        if (cancelled) return;
        setSnapshot(payload);
        setActiveRequest(payload.latestRequest);
        if (payload.latestRequest) {
          setClanName(payload.latestRequest.clanName);
          setFoundingMessage(payload.latestRequest.foundingMessage);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The Clan Hall Treasury could not be loaded."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const amountWolo = snapshot?.priceWolo ?? 100;
  const paymentBroadcast = activeRequest?.paymentStatus === "broadcast";
  const paymentConfirmed = activeRequest?.paymentStatus === "confirmed";
  const requestLocked = paymentBroadcast || paymentConfirmed;
  const canSend = Boolean(snapshot?.ready) && clanName.trim().length >= 2 && !working;

  async function verifyPaymentProof(
    intent: PurchaseRequest,
    txHash: string,
    fromAddress: string
  ) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch("/api/clans/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          publicId: intent.publicId,
          txHash,
          fromAddress,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        request?: PurchaseRequest;
        pending?: boolean;
        detail?: string;
      };
      if (payload.request) setActiveRequest(payload.request);
      if (response.ok && payload.request) return payload.request;
      if (response.status === 202 && payload.pending) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      throw new Error(payload.detail || "The Clan Hall could not verify the WOLO payment.");
    }
    throw new Error(
      "Your payment was broadcast, but WoloChain has not indexed it yet. The proof is saved—verify again shortly and do not pay twice."
    );
  }

  async function submitPaidRequest(request: PurchaseRequest) {
    const response = await fetch("/api/clans/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", publicId: request.publicId }),
    });
    const payload = await responseJson<{ request: PurchaseRequest }>(response);
    setSuccess(
      `Clan Alert #${payload.request.publicId.slice(0, 8)} sent to Emaren. The verified 100 WOLO purchase is waiting in Clan Command.`
    );
    setActiveRequest(null);
    setClanName("");
    setFoundingMessage("");
  }

  async function buyClanHall() {
    if (clanName.trim().length < 2) return;
    setWorking(true);
    setError(null);
    setSuccess(null);

    try {
      if (activeRequest?.paymentStatus === "broadcast" && activeRequest.txHash) {
        const confirmed = await verifyPaymentProof(
          activeRequest,
          activeRequest.txHash,
          activeRequest.requesterAddress
        );
        await submitPaidRequest(confirmed);
        return;
      }
      if (activeRequest?.paymentStatus === "confirmed") {
        await submitPaidRequest(activeRequest);
        return;
      }

      const walletAddress = await connectKeplrAddress();
      const intentResponse = await fetch("/api/clans/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "intent",
          walletAddress,
          clanName: clanName.trim(),
          foundingMessage: foundingMessage.trim(),
        }),
      });
      const intentPayload = await responseJson<{ request: PurchaseRequest }>(intentResponse);
      const intent = intentPayload.request;
      setActiveRequest(intent);

      const payment = await payWoloOnChain({
        recipientAddress: intent.recipientAddress,
        amountWolo: intent.amountWolo,
        memo: intent.memo,
        fallbackWalletAddress: walletAddress,
      });
      if (payment.walletAddress.trim().toLowerCase() !== walletAddress) {
        throw new Error("Keplr changed accounts during the Clan Hall payment.");
      }

      const confirmed = await verifyPaymentProof(
        intent,
        payment.transactionHash,
        payment.walletAddress
      );
      await submitPaidRequest(confirmed);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The Clan Hall purchase could not be sent.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      id="buy-clan-hall"
      className="clan-purchase-rail relative overflow-hidden rounded-[2.1rem] border border-red-200/16 bg-[radial-gradient(circle_at_15%_0%,rgba(185,28,28,0.17),transparent_34%),radial-gradient(circle_at_92%_18%,rgba(245,158,11,0.10),transparent_30%),linear-gradient(145deg,rgba(20,12,9,0.97),rgba(5,7,10,0.99))] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.45)] sm:p-8"
    >
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />
      <div className="relative mx-auto max-w-5xl">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-red-100/70">
          <Landmark className="h-4 w-4 text-amber-200" />
          Found a house
        </div>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-serif text-3xl text-white sm:text-4xl">Buy a Clan Hall</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-400">
              Pay <span className="font-semibold text-amber-100">{amountWolo} WOLO</span> on WoloChain and send Emaren a verified Clan Alert. Once accepted, your house, admin seat, crest library, and hall can be raised.
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200/16 bg-amber-300/[0.06] px-4 py-2 text-xs font-bold text-amber-100">
            <Shield className="h-4 w-4" /> One hall · {amountWolo} WOLO
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <label className="grid gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">Clan name</span>
            <input
              value={clanName}
              onChange={(event) => setClanName(event.target.value.slice(0, 120))}
              disabled={working || requestLocked}
              placeholder="The name under your banner"
              className="min-h-12 rounded-[1.15rem] border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-stone-700 focus:border-red-200/28 disabled:opacity-65"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500">Clan Alert to Emaren</span>
            <textarea
              value={foundingMessage}
              onChange={(event) => setFoundingMessage(event.target.value.slice(0, 2_000))}
              disabled={working || requestLocked}
              rows={4}
              placeholder="Who are you, who should lead the hall, and what banner are you raising?"
              className="resize-y rounded-[1.15rem] border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-stone-700 focus:border-red-200/28 disabled:opacity-65"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-stone-600">Verified payment · private Clan Alert · Emaren acceptance</div>
          <button
            type="button"
            disabled={!canSend}
            onClick={() => void buyClanHall()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-100/20 bg-amber-300 px-5 py-3 text-sm font-black text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {working ? (
              <><WalletCards className="h-4 w-4" />Processing…</>
            ) : paymentBroadcast ? (
              <><Check className="h-4 w-4" />Verify &amp; Send Clan Alert</>
            ) : paymentConfirmed ? (
              <><Send className="h-4 w-4" />Finish Sending Clan Alert</>
            ) : (
              <><Send className="h-4 w-4" />Buy a Clan Hall · {amountWolo} WOLO</>
            )}
          </button>
        </div>

        {paymentBroadcast ? (
          <p className="mt-4 text-sm leading-6 text-amber-100/75">
            Your payment was broadcast. The Clan Alert and proof are saved. Verify it to finish—do not pay again.
          </p>
        ) : null}
        {success ? (
          <div className="mt-5 flex items-center gap-2 rounded-[1.15rem] border border-emerald-300/15 bg-emerald-400/[0.06] px-4 py-3 text-sm font-semibold text-emerald-100">
            <Check className="h-4 w-4" /> {success}
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm leading-6 text-rose-300">{error}</p> : null}
      </div>
    </section>
  );
}
