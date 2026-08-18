"use client";

import Link from "next/link";
import { ArrowRight, Coins, Loader2, MessageSquareText } from "lucide-react";
import { useState } from "react";

import { payWoloOnChain } from "@/lib/clientMarketplacePayment";

type QuotePayload = {
  ok?: boolean;
  state?: string;
  inquiryId?: string;
  amountWolo?: number;
  recipientAddress?: string;
  memo?: string;
  fallbackWalletAddress?: string | null;
  detail?: string;
};

type ConfirmPayload = {
  ok?: boolean;
  state?: string;
  contactHref?: string;
  txHash?: string;
  proofUrl?: string | null;
  detail?: string;
};

export default function MarketplaceInquiryComposer({
  shopSlug,
  shopName,
  compact = false,
  compactTone = "teal",
}: {
  shopSlug: string;
  shopName: string;
  compact?: boolean;
  compactTone?: "teal" | "blue";
}) {
  const [requestText, setRequestText] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [contactHref, setContactHref] = useState<string | null>(null);

  const compactTriggerClass =
    compactTone === "blue"
      ? "border-blue-100/18 bg-blue-300/[0.055] text-blue-100 hover:border-blue-100/32 hover:bg-blue-300/[0.10]"
      : "border-teal-100/14 bg-teal-300/[0.055] text-teal-100 hover:border-teal-100/28 hover:bg-teal-300/[0.10]";
  const compactPanelClass =
    compactTone === "blue"
      ? "border-blue-100/24 bg-[#071126]/[0.985]"
      : "border-teal-100/22 bg-[#061012]/[0.985]";
  const compactPayClass =
    compactTone === "blue"
      ? "border-blue-100/22 bg-blue-300/[0.09] text-blue-50 hover:bg-blue-300/[0.14]"
      : "border-teal-100/20 bg-teal-300/[0.08] text-teal-50 hover:bg-teal-300/[0.13]";
  const compactHeaderClass =
    compactTone === "blue" ? "text-blue-100/65" : "text-teal-100/65";

  async function submit() {
    setPending(true);
    setStatus("");
    setContactHref(null);

    try {
      const endpoint = `/api/market/shops/${encodeURIComponent(shopSlug)}/inquiries`;
      const quoteResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quote", requestText }),
      });
      const quote = (await quoteResponse.json().catch(() => ({}))) as QuotePayload;
      if (
        !quoteResponse.ok ||
        !quote.inquiryId ||
        !quote.amountWolo ||
        !quote.recipientAddress ||
        !quote.memo
      ) {
        throw new Error(quote.detail || "Marketplace inquiry quote failed.");
      }

      const payment = await payWoloOnChain({
        recipientAddress: quote.recipientAddress,
        amountWolo: quote.amountWolo,
        memo: quote.memo,
        fallbackWalletAddress: quote.fallbackWalletAddress,
      });

      const confirmResponse = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          inquiryId: quote.inquiryId,
          txHash: payment.transactionHash,
          fromAddress: payment.walletAddress,
        }),
      });
      const confirmed = (await confirmResponse.json().catch(() => ({}))) as ConfirmPayload;
      if (!confirmResponse.ok || !confirmed.ok) {
        throw new Error(confirmed.detail || "Marketplace inquiry verification failed.");
      }

      setRequestText("");
      setContactHref(confirmed.contactHref || null);
      setStatus(`100 WOLO paid to ${shopName}. Your request was delivered.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Marketplace inquiry failed.");
    } finally {
      setPending(false);
    }
  }

  function formBody(compactMode: boolean) {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div
            className={`text-[10px] font-black uppercase tracking-[0.22em] ${
              compactMode ? compactHeaderClass : "text-teal-100/65"
            }`}
          >
            Purchase request · 100 WOLO
          </div>
          {compactMode ? (
            <button
              type="button"
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              Close
            </button>
          ) : null}
        </div>

        <textarea
          value={requestText}
          onChange={(event) => setRequestText(event.target.value)}
          rows={compactMode ? 4 : 5}
          maxLength={1200}
          placeholder="Tell the merchant what you want to buy, repair, or have made..."
          className={`mt-3 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600 focus:border-teal-100/25 ${
            compactMode ? "min-h-0 flex-1 resize-none" : "resize-y"
          }`}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] leading-5 text-slate-500">
            {compactMode
              ? "100 WOLO goes directly to the merchant."
              : "The 100 WOLO goes directly to the merchant and counts as the first business payment."}
          </div>

          <button
            type="button"
            disabled={pending || !requestText.trim()}
            onClick={() => void submit()}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              compactMode
                ? `w-full justify-center ${compactPayClass}`
                : "border-teal-100/20 bg-teal-300/[0.08] text-teal-50 hover:bg-teal-300/[0.13]"
            }`}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Coins className="h-4 w-4" />
            )}
            Pay & deliver · 100 WOLO
          </button>
        </div>

        {status ? (
          <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300">
            {status}
            {contactHref ? (
              <Link
                href={contactHref}
                className="ml-2 inline-flex items-center gap-1 font-semibold text-teal-100 hover:text-white"
              >
                Continue in chat <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  if (!compact) {
    return (
      <div className="rounded-[1.45rem] border border-white/9 bg-black/24 p-5">
        {formBody(false)}
      </div>
    );
  }

  return (
    <details className="group">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold transition hover:text-white [&::-webkit-details-marker]:hidden ${compactTriggerClass}`}
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        Open counter · 100 WOLO
      </summary>

      <div
        className={`absolute inset-x-3 bottom-3 top-[6.65rem] z-30 flex flex-col overflow-hidden rounded-[1.2rem] border p-3.5 shadow-[0_24px_70px_rgba(0,0,0,0.62)] backdrop-blur-xl ${compactPanelClass}`}
      >
        {formBody(true)}
      </div>
    </details>
  );
}
