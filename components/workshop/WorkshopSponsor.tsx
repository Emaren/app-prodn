"use client";

import { Check, Hammer, Send, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";

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
};

type SponsorSnapshot = {
  ok: boolean;
  ready: boolean;
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

export default function WorkshopSponsor() {
  const [snapshot, setSnapshot] = useState<SponsorSnapshot | null>(null);
  const [activeRequest, setActiveRequest] =
    useState<SponsorRequest | null>(null);
  const [requestText, setRequestText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/workshop/sponsor", {
      cache: "no-store",
    })
      .then((response) => responseJson<SponsorSnapshot>(response))
      .then((payload) => {
        if (cancelled) return;

        setSnapshot(payload);
        setActiveRequest(payload.latestRequest);

        if (payload.latestRequest?.requestText) {
          setRequestText(payload.latestRequest.requestText);
        }
      })
      .catch((loadError) => {
        if (cancelled) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "The Workshop patronage rail could not be loaded.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const amountWolo = snapshot?.sponsorAmountWolo ?? 100;
  const paymentBroadcast = activeRequest?.paymentStatus === "broadcast";
  const paymentConfirmed = activeRequest?.paymentStatus === "confirmed";
  const requestLocked = paymentBroadcast || paymentConfirmed;

  const canSend =
    Boolean(snapshot?.ready) &&
    requestText.trim().length >= 3 &&
    !working;

  async function verifyPaymentProof(
    intent: SponsorRequest,
    txHash: string,
    fromAddress: string,
  ) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await fetch("/api/workshop/sponsor", {
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

      const payload = (await response.json().catch(() => ({}))) as {
        request?: SponsorRequest;
        pending?: boolean;
        detail?: string;
      };

      if (payload.request) {
        setActiveRequest(payload.request);
      }

      if (response.ok && payload.request) {
        return payload.request;
      }

      if (response.status === 202 && payload.pending) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }

      throw new Error(
        payload.detail ||
          "The Workshop could not verify the WOLO payment.",
      );
    }

    throw new Error(
      "Your 100 WOLO payment was broadcast, but WoloChain has not indexed it yet. Your request and transaction proof are saved. Use Verify & Send Request shortly; do not pay again.",
    );
  }

  async function submitPaidRequest(
    request: SponsorRequest,
    text: string,
  ) {
    const response = await fetch("/api/workshop/sponsor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "submit",
        publicId: request.publicId,
        requestText: text,
      }),
    });

    const payload = await responseJson<{
      request: SponsorRequest;
    }>(response);

    setSuccess(
      `Feature request #${payload.request.publicId.slice(0, 8)} sent privately to Emaren.`,
    );

    // The durable request remains in the database and Emaren's inbox.
    // The public Patronage composer immediately becomes ready for another idea.
    setActiveRequest(null);
    setRequestText("");
  }

  async function sendFeatureRequest() {
    const typedText = requestText.trim();

    if (typedText.length < 3) {
      return;
    }

    setWorking(true);
    setError(null);
    setSuccess(null);

    try {
      // Recover a transaction that was already broadcast without paying again.
      if (
        activeRequest?.paymentStatus === "broadcast" &&
        activeRequest.sponsorTxHash
      ) {
        const confirmed = await verifyPaymentProof(
          activeRequest,
          activeRequest.sponsorTxHash,
          activeRequest.requesterAddress,
        );

        await submitPaidRequest(
          confirmed,
          confirmed.requestText || activeRequest.requestText || typedText,
        );

        return;
      }

      // Recover a payment that was confirmed before the final inbox delivery.
      if (activeRequest?.paymentStatus === "confirmed") {
        await submitPaidRequest(
          activeRequest,
          activeRequest.requestText || typedText,
        );

        return;
      }

      const walletAddress = await connectKeplrAddress();

      // Persist the feature text before Keplr opens the payment transaction.
      const intentResponse = await fetch("/api/workshop/sponsor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "intent",
          walletAddress,
          requestText: typedText,
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

      if (
        payment.walletAddress.trim().toLowerCase() !== walletAddress
      ) {
        throw new Error(
          "Keplr changed accounts during the Workshop payment. The feature request was not submitted.",
        );
      }

      const confirmed = await verifyPaymentProof(
        intent,
        payment.transactionHash,
        payment.walletAddress,
      );

      await submitPaidRequest(
        confirmed,
        confirmed.requestText || typedText,
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "The feature request could not be sent.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      id="sponsor-a-feature"
      className="overflow-hidden rounded-[2rem] border border-amber-100/12 bg-[radial-gradient(circle_at_15%_0%,rgba(251,191,36,0.10),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-7"
    >
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-100/60">
          <Hammer className="h-4 w-4" />
          Patronage
        </div>

        <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
          Buy a Feature
        </h2>

        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          Describe something you want to see built on AoE2WAR. Sending the
          request costs{" "}
          <span className="font-semibold text-amber-100">
            {amountWolo} WOLO
          </span>
          . Your payment is verified on WoloChain and the request is delivered
          privately to Emaren.
        </p>

        <label className="mt-6 block">
          <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
            Describe your feature
          </span>

          <textarea
            value={requestText}
            onChange={(event) => {
              setRequestText(event.target.value);
              setSuccess(null);
            }}
            disabled={working || requestLocked}
            maxLength={4_000}
            rows={5}
            placeholder="What would make AoE2WAR better?"
            className="mt-2 w-full resize-y rounded-[1.35rem] border border-white/10 bg-black/25 px-4 py-4 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/30 disabled:cursor-not-allowed disabled:opacity-65"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs leading-5 text-slate-500">
            One private feature request · {amountWolo} WOLO
          </div>

          <button
            type="button"
            disabled={!canSend}
            onClick={() => void sendFeatureRequest()}
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-amber-100/20 bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {working ? (
              <>
                <WalletCards className="h-4 w-4" />
                Processing…
              </>
            ) : paymentBroadcast ? (
              <>
                <Check className="h-4 w-4" />
                Verify &amp; Send Request
              </>
            ) : paymentConfirmed ? (
              <>
                <Send className="h-4 w-4" />
                Finish Sending Request
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Feature Request · {amountWolo} WOLO
              </>
            )}
          </button>
        </div>

        {paymentBroadcast ? (
          <p className="mt-4 text-sm leading-6 text-amber-100/75">
            Your payment was already broadcast. The feature text and transaction
            proof are saved. Verify the payment to finish sending it—do not pay
            again.
          </p>
        ) : null}

        {success ? (
          <div className="mt-5 flex items-center gap-2 rounded-[1.15rem] border border-emerald-300/15 bg-emerald-400/[0.06] px-4 py-3 text-sm font-semibold text-emerald-100">
            <Check className="h-4 w-4" />
            {success}
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm leading-6 text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
