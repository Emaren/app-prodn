"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, Loader2, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { payWoloOnChain } from "@/lib/clientMarketplacePayment";

type InvoicePayload = {
  ok?: boolean;
  invoice?: {
    publicId: string;
    shopSlug: string;
    shopName: string;
    issuerDisplayName: string;
    customerDisplayName: string;
    description: string;
    amountWolo: number;
    status: string;
    memo: string;
    recipientAddress: string;
    createdAt: string;
    paidAt: string | null;
    txHash: string | null;
    proofUrl: string | null;
    viewerIsCustomer: boolean;
    fallbackWalletAddress: string | null;
  };
  detail?: string;
};

export default function MarketplaceInvoiceClient({ publicId }: { publicId: string }) {
  const [payload, setPayload] = useState<InvoicePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/market/invoices/${encodeURIComponent(publicId)}`, { cache: "no-store" });
      const next = (await response.json().catch(() => ({}))) as InvoicePayload;
      if (!response.ok || !next.invoice) throw new Error(next.detail || "Invoice unavailable.");
      setPayload(next);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invoice unavailable.");
    } finally {
      setLoading(false);
    }
  }, [publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pay() {
    const invoice = payload?.invoice;
    if (!invoice) return;
    setPending(true);
    setStatus("");
    try {
      const payment = await payWoloOnChain({
        recipientAddress: invoice.recipientAddress,
        amountWolo: invoice.amountWolo,
        memo: invoice.memo,
        fallbackWalletAddress: invoice.fallbackWalletAddress,
      });
      const response = await fetch(`/api/market/invoices/${encodeURIComponent(publicId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: payment.transactionHash,
          fromAddress: payment.walletAddress,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) throw new Error(result.detail || "Invoice payment failed.");
      setStatus("Invoice paid and verified on WoloChain.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invoice payment failed.");
    } finally {
      setPending(false);
    }
  }

  if (loading && !payload) {
    return <main className="py-10 text-slate-300"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading Marketplace invoice...</main>;
  }

  const invoice = payload?.invoice;
  if (!invoice) {
    return <main className="py-10 text-slate-300">{status || "Invoice unavailable."}</main>;
  }

  const paid = invoice.status === "paid";

  return (
    <main className="mx-auto max-w-3xl py-5 text-white">
      <Link href={`/market/shops/${encodeURIComponent(invoice.shopSlug)}`} className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to {invoice.shopName}
      </Link>

      <section className="mt-5 overflow-hidden rounded-[2rem] border border-amber-100/16 bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.10),transparent_34%),linear-gradient(145deg,rgba(18,20,26,0.98),rgba(5,8,15,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.35)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/65">
              <ReceiptText className="h-4 w-4" /> Marketplace invoice
            </div>
            <h1 className="mt-3 font-serif text-4xl font-medium text-[#eadfc2]">{invoice.shopName}</h1>
            <p className="mt-2 text-sm text-slate-400">From {invoice.issuerDisplayName} · To {invoice.customerDisplayName}</p>
          </div>
          <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${paid ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-100" : "border-amber-200/20 bg-amber-300/10 text-amber-100"}`}>
            {paid ? "Paid" : "Awaiting payment"}
          </span>
        </div>

        <div className="mt-6 rounded-[1.4rem] border border-white/9 bg-black/20 p-5 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
          {invoice.description}
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-white/9 pt-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Amount due</div>
            <div className="mt-1 text-4xl font-semibold text-white">{invoice.amountWolo} WOLO</div>
          </div>

          {paid ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-100">
              <CheckCircle2 className="h-4 w-4" /> Verified on WoloChain
            </div>
          ) : invoice.viewerIsCustomer ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => void pay()}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/22 bg-amber-300/10 px-5 py-3 text-sm font-bold text-amber-50 transition hover:bg-amber-300/16 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              Pay {invoice.amountWolo} WOLO
            </button>
          ) : (
            <span className="text-sm text-slate-500">Waiting for the customer.</span>
          )}
        </div>

        {invoice.proofUrl ? (
          <a href={invoice.proofUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-100/80 hover:text-emerald-50">
            View payment proof <ArrowRight className="h-3.5 w-3.5" />
          </a>
        ) : null}

        {status ? <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300">{status}</div> : null}
      </section>
    </main>
  );
}
