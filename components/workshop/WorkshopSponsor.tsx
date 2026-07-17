"use client";

import { Check, Copy, Hammer, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { payWoloOnChain } from "@/lib/clientMarketplacePayment";
import { WOLO_CHAIN_ID, woloChainConfig } from "@/lib/woloChain";

type SponsorRequest = {
  publicId: string;
  requestText: string | null;
  requesterAddress: string;
  sponsorAmountWolo: number;
  sponsorRecipientAddress: string;
  sponsorMemo: string;
  sponsorTxHash: string | null;
  paymentStatus: string;
  status: string;
  sponsoredAt: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  refundedAt: string | null;
  refundStatus: string;
  developmentValueWolo: number | null;
  createdAt: string;
};

type SponsorSnapshot = {
  ok: boolean;
  ready: boolean;
  treasury: {
    label: string;
    address: string | null;
  };
  sponsorAmountWolo: number;
  latestRequest: SponsorRequest | null;
};

type KeplrWindow = Window & {
  keplr?: {
    enable?: (chainId: string) => Promise<void>;
    experimentalSuggestChain?: (
      config: typeof woloChainConfig,
    ) => Promise<void>;
    getKey?: (chainId: string) => Promise<{
      bech32Address?: string;
    }>;
  };
};

async function responseJson<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as T & {
    detail?: string;
  };

  if (!response.ok) {
    throw new Error(payload.detail || "The Workshop request failed.");
  }

  return payload;
}

async function connectKeplrAddress() {
  const browser = window as KeplrWindow;

  if (!browser.keplr) {
    throw new Error("Keplr extension not found.");
  }

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

function shortAddress(address: string | null) {
  if (!address) {
    return "Not configured";
  }

  if (address.length <= 20) {
    return address;
  }

  return `${address.slice(0, 12)}…${address.slice(-8)}`;
}

function statusLabel(request: SponsorRequest | null) {
  if (!request) {
    return "Ready for a patron";
  }

  switch (request.status) {
    case "awaiting_payment":
      return "Awaiting sponsorship";
    case "awaiting_request":
      return "Payment confirmed";
    case "submitted":
      return "Submitted";
    case "accepted":
      return "Accepted";
    case "on_anvil":
      return "On the Anvil";
    case "live":
      return "Live";
    case "declined":
      return "Declined";
    default:
      return request.status.replace(/_/g, " ");
  }
}

export default function WorkshopSponsor() {
  const [snapshot, setSnapshot] = useState<SponsorSnapshot | null>(null);

  const [activeRequest, setActiveRequest] = useState<SponsorRequest | null>(
    null,
  );

  const [requestText, setRequestText] = useState("");

  const [working, setWorking] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/workshop/sponsor", {
      cache: "no-store",
    })
      .then((response) => responseJson<SponsorSnapshot>(response))
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setSnapshot(payload);
        setActiveRequest(payload.latestRequest);

        if (payload.latestRequest?.requestText) {
          setRequestText(payload.latestRequest.requestText);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "The Workshop Treasury could not be loaded.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const amountWolo = snapshot?.sponsorAmountWolo ?? 100;

  const treasuryAddress = snapshot?.treasury.address ?? null;

  const paymentConfirmed = activeRequest?.paymentStatus === "confirmed";

  const submitted =
    activeRequest?.status === "submitted" ||
    activeRequest?.status === "accepted" ||
    activeRequest?.status === "on_anvil" ||
    activeRequest?.status === "live";

  const canSponsor = Boolean(snapshot?.ready) && !working;

  const outcome = useMemo(() => {
    if (!activeRequest) {
      return null;
    }

    if (
      activeRequest.status === "live" &&
      activeRequest.developmentValueWolo != null
    ) {
      const delta =
        activeRequest.developmentValueWolo - activeRequest.sponsorAmountWolo;

      return delta >= 0
        ? `KINGDOM WON · +${delta.toLocaleString()} WOLO VALUE`
        : "WORKSHOP WON · QUICK BUILD";
    }

    return null;
  }, [activeRequest]);

  async function verifyPaymentProof(
    intent: SponsorRequest,
    txHash: string,
    fromAddress: string,
  ) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const verifyResponse = await fetch("/api/workshop/sponsor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify",
          publicId: intent.publicId,
          txHash,
          fromAddress,
        }),
      });

      const payload = (await verifyResponse.json().catch(() => ({}))) as {
        request?: SponsorRequest;
        pending?: boolean;
        detail?: string;
      };

      if (payload.request) {
        setActiveRequest(payload.request);
      }

      if (verifyResponse.ok && payload.request) {
        return payload.request;
      }

      if (verifyResponse.status === 202 && payload.pending) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));

        continue;
      }

      throw new Error(
        payload.detail || "The Workshop could not verify the WOLO sponsorship.",
      );
    }

    throw new Error(
      "The 100 WOLO payment was broadcast, but the Workshop indexer has not confirmed it yet. Your transaction proof has been saved. Try verification again shortly; do not send another payment.",
    );
  }

  async function beginSponsorship() {
    setWorking(true);
    setError(null);

    try {
      if (
        activeRequest?.paymentStatus === "broadcast" &&
        activeRequest.sponsorTxHash
      ) {
        const confirmed = await verifyPaymentProof(
          activeRequest,
          activeRequest.sponsorTxHash,
          activeRequest.requesterAddress,
        );

        setActiveRequest(confirmed);
        return;
      }

      const walletAddress = await connectKeplrAddress();

      const intentResponse = await fetch("/api/workshop/sponsor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "intent",
          walletAddress,
        }),
      });

      const intentPayload = await responseJson<{
        request: SponsorRequest;
      }>(intentResponse);

      const intent = intentPayload.request;

      setActiveRequest(intent);

      const payment = await payWoloOnChain({
        recipientAddress: intent.sponsorRecipientAddress,
        amountWolo: intent.sponsorAmountWolo,
        memo: intent.sponsorMemo,
        fallbackWalletAddress: walletAddress,
      });

      if (payment.walletAddress.trim().toLowerCase() !== walletAddress) {
        throw new Error(
          "Keplr changed accounts during the Workshop sponsorship. No request was submitted.",
        );
      }

      const confirmed = await verifyPaymentProof(
        intent,
        payment.transactionHash,
        payment.walletAddress,
      );

      setActiveRequest(confirmed);
    } catch (sponsorError) {
      setError(
        sponsorError instanceof Error
          ? sponsorError.message
          : "The Workshop sponsorship could not be completed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function submitRequest() {
    if (!activeRequest) {
      return;
    }

    setWorking(true);
    setError(null);

    try {
      const response = await fetch("/api/workshop/sponsor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "submit",
          publicId: activeRequest.publicId,
          requestText,
        }),
      });

      const payload = await responseJson<{
        request: SponsorRequest;
      }>(response);

      setActiveRequest(payload.request);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The feature idea could not be submitted.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function copyTreasury() {
    if (!treasuryAddress) {
      return;
    }

    await navigator.clipboard.writeText(treasuryAddress);

    setCopied(true);

    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section
      id="sponsor-a-feature"
      className="overflow-hidden rounded-[2rem] border border-amber-100/12 bg-[radial-gradient(circle_at_15%_0%,rgba(251,191,36,0.10),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-7"
    >
      <div className="grid gap-7 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-100/60">
            <Hammer className="h-4 w-4" />
            Patronage
          </div>

          <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
            Sponsor a Feature
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            Ask the Kingdom to build something. Sponsoring a request costs{" "}
            <span className="font-semibold text-amber-100">
              {amountWolo} WOLO
            </span>
            . Sponsorship pays for consideration, not guaranteed delivery. A
            declined request is eligible for refund through the Workshop
            Treasury.
          </p>

          <div className="mt-6 rounded-[1.35rem] border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-slate-500">
                  Workshop Treasury
                </div>

                <div className="mt-1 font-mono text-sm text-slate-200">
                  {shortAddress(treasuryAddress)}
                </div>
              </div>

              {treasuryAddress ? (
                <button
                  type="button"
                  onClick={() => void copyTreasury()}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy address"}
                </button>
              ) : null}
            </div>
          </div>

          {!paymentConfirmed ? (
            <button
              type="button"
              disabled={!canSponsor}
              onClick={() => void beginSponsorship()}
              className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-100/20 bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <WalletCards className="h-4 w-4" />
              {working
                ? activeRequest?.paymentStatus === "broadcast"
                  ? "Verifying payment…"
                  : "Opening Keplr…"
                : activeRequest?.paymentStatus === "broadcast"
                  ? "Verify sponsorship"
                  : `Sponsor a Feature · ${amountWolo} WOLO`}
            </button>
          ) : null}

          {paymentConfirmed && !submitted ? (
            <div className="mt-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <ShieldCheck className="h-4 w-4" />
                Sponsorship confirmed on WoloChain
              </div>

              <label className="mt-5 block">
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                  What should we build?
                </span>

                <textarea
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  maxLength={4_000}
                  rows={5}
                  placeholder="Tell the Workshop what would make AoE2WAR better…"
                  className="mt-2 w-full resize-y rounded-[1.25rem] border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/25"
                />
              </label>

              <button
                type="button"
                disabled={working || requestText.trim().length < 3}
                onClick={() => void submitRequest()}
                className="mt-3 cursor-pointer rounded-full border border-white/12 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {working
                  ? "Sending to the Workshop…"
                  : "Submit to the Workshop"}
              </button>
            </div>
          ) : null}

          {submitted ? (
            <div className="mt-6 rounded-[1.25rem] border border-emerald-300/15 bg-emerald-400/[0.06] p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                <Check className="h-4 w-4" />
                Your feature is in the Workshop
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                It now has its own durable request record and payment proof.
                Accepted work can move onto the Anvil and eventually into the
                Workshop Chronicle.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm leading-6 text-rose-300">{error}</p>
          ) : null}
        </div>

        <aside className="rounded-[1.5rem] border border-white/8 bg-black/20 p-5">
          <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-slate-500">
            Patron Record
          </div>

          <div className="mt-4 font-serif text-2xl text-white">
            {statusLabel(activeRequest)}
          </div>

          {activeRequest ? (
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-b border-white/6 pb-3">
                <span className="text-slate-500">Sponsorship</span>
                <span className="font-semibold text-amber-100">
                  {activeRequest.sponsorAmountWolo.toLocaleString()} WOLO
                </span>
              </div>

              <div className="flex justify-between gap-4 border-b border-white/6 pb-3">
                <span className="text-slate-500">Payment</span>
                <span className="text-right text-slate-300">
                  {activeRequest.paymentStatus === "confirmed"
                    ? "Confirmed"
                    : "Awaiting"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Request</span>
                <span className="font-mono text-xs text-slate-400">
                  {activeRequest.publicId.slice(0, 8)}
                </span>
              </div>

              {outcome ? (
                <div className="mt-4 rounded-full border border-amber-200/15 bg-amber-300/[0.06] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100">
                  {outcome}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Connect Keplr and become the first patron of the Workshop.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
