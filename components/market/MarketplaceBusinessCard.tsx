"use client";

import Link from "next/link";
import {
  ArrowRight,
  Coins,
  FileText,
  Landmark,
  Loader2,
  Power,
  ReceiptText,
  Store,
  Wrench,
  ImagePlus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { payWoloOnChain } from "@/lib/clientMarketplacePayment";

type BusinessSummary = {
  shop: {
    publicId: string;
    slug: string;
    name: string;
    offer: string;
    proprietorLabel: string;
    streetKey: string;
    slot: number;
    displayEnabled: boolean;
    heroImageUrl: string | null;
    href: string;
    charterAmountWolo: number;
    charterState: string;
    charterTxHash: string | null;
  };
  taxRateBps: number;
  grossRevenueWolo: number;
  taxAccruedWolo: number;
  taxPaidWolo: number;
  taxDueWolo: number;
  developmentSpentWolo: number;
  paidInquiryCount: number;
  openInvoiceCount: number;
  customers: Array<{
    inquiryPublicId: string;
    userId: number;
    uid: string;
    displayName: string;
    requestText: string;
    paidAt: string | null;
  }>;
  invoices: Array<{
    publicId: string;
    customerDisplayName: string;
    amountWolo: number;
    description: string;
    status: string;
    createdAt: string;
    paidAt: string | null;
  }>;
  activity: Array<{
    id: string;
    kind: "inquiry" | "invoice" | "tax" | "development";
    amountWolo: number;
    direction: "in" | "out";
    label: string;
    detail: string | null;
    createdAt: string;
  }>;
};

type BusinessPayload = {
  ok?: boolean;
  viewerWalletAddress?: string | null;
  viewerDisplayName?: string;
  business?: BusinessSummary | null;
  detail?: string;
};

type PaymentQuote = {
  ok?: boolean;
  state?: string;
  requestId?: string;
  taxPaymentId?: string;
  amountWolo?: number;
  recipientAddress?: string;
  memo?: string;
  fallbackWalletAddress?: string | null;
  detail?: string;
};

async function readJson<T>(response: Response) {
  return (await response.json().catch(() => ({}))) as T;
}

export default function MarketplaceBusinessCard() {
  const [payload, setPayload] = useState<BusinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [nameDraft, setNameDraft] = useState("");
  const [offerDraft, setOfferDraft] = useState("");
  const [developText, setDevelopText] = useState("");
  const [invoiceInquiryId, setInvoiceInquiryId] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("100");
  const [invoiceDescription, setInvoiceDescription] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [approvalNudge, setApprovalNudge] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/market/business", { cache: "no-store" });
      const next = await readJson<BusinessPayload>(response);
      if (!response.ok) {
        throw new Error(next.detail || "Business profile unavailable.");
      }
      setPayload(next);
      setNameDraft(next.business?.shop.name || "");
      setOfferDraft(next.business?.shop.offer || "");
      if (!invoiceInquiryId && next.business?.customers[0]) {
        setInvoiceInquiryId(next.business.customers[0].inquiryPublicId);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Business profile unavailable.");
    } finally {
      setLoading(false);
    }
  }, [invoiceInquiryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const business = payload?.business || null;
  const taxPercent = useMemo(
    () => ((business?.taxRateBps || 0) / 100).toFixed(0),
    [business?.taxRateBps]
  );

  const streetLabel = useMemo(() => {
    const key = business?.shop.streetKey || "";
    if (key === "second-street") return "2nd Street";
    if (key === "third-street") return "3rd Street";
    if (key === "fourth-street") return "4th Street";
    if (key === "fifth-street") return "5th Street";
    if (key === "sixth-street") return "6th Street";
    if (key === "seventh-street") return "7th Street";
    return key.replaceAll("-", " ");
  }, [business?.shop.streetKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !business?.shop.publicId) return;

    const approvedId = new URLSearchParams(window.location.search).get(
      "marketplaceApproved"
    );
    if (!approvedId || approvedId !== business.shop.publicId) return;

    const storageKey = `aoe2war:marketplace-approved-nudge:${approvedId}`;
    if (window.sessionStorage.getItem(storageKey) === "1") return;

    const timer = window.setTimeout(() => {
      document.getElementById("my-business")?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setApprovalNudge(true);
      window.sessionStorage.setItem(storageKey, "1");
      window.setTimeout(() => setApprovalNudge(false), 2000);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [business?.shop.publicId]);

  if (loading && !payload) {
    return (
      <section id="my-business" className="scroll-mt-24 rounded-[2rem] border border-amber-100/10 bg-slate-950/70 p-6 sm:p-7">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Marketplace business...
        </div>
      </section>
    );
  }

  if (!business) return null;

  async function patchBusiness(body: Record<string, unknown>, key: string) {
    setPending(key);
    setStatus("");
    try {
      const response = await fetch("/api/market/business", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const next = await readJson<BusinessPayload>(response);
      if (!response.ok) throw new Error(next.detail || "Business update failed.");
      setPayload((current) => ({
        ...(current || {}),
        business: next.business || current?.business || null,
      }));
      setStatus("Business updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Business update failed.");
    } finally {
      setPending(null);
    }
  }

  async function runPaidRequest(input: {
    endpoint: string;
    quoteBody: Record<string, unknown>;
    confirmIdKey: "requestId" | "taxPaymentId";
    pendingKey: string;
  }) {
    setPending(input.pendingKey);
    setStatus("");
    try {
      const quoteResponse = await fetch(input.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quote", ...input.quoteBody }),
      });
      const quote = await readJson<PaymentQuote>(quoteResponse);
      if (
        !quoteResponse.ok ||
        !quote.amountWolo ||
        !quote.recipientAddress ||
        !quote.memo ||
        !quote[input.confirmIdKey]
      ) {
        throw new Error(quote.detail || "Marketplace payment quote failed.");
      }

      const payment = await payWoloOnChain({
        recipientAddress: quote.recipientAddress,
        amountWolo: quote.amountWolo,
        memo: quote.memo,
        fallbackWalletAddress: quote.fallbackWalletAddress,
      });

      const confirmResponse = await fetch(input.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          [input.confirmIdKey]: quote[input.confirmIdKey],
          txHash: payment.transactionHash,
          fromAddress: payment.walletAddress,
        }),
      });
      const confirmed = await readJson<{ detail?: string }>(confirmResponse);
      if (!confirmResponse.ok) {
        throw new Error(confirmed.detail || "Marketplace payment verification failed.");
      }

      setStatus("Payment verified on WoloChain.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Marketplace payment failed.");
    } finally {
      setPending(null);
    }
  }

  async function uploadBusinessImage(file: File | null) {
    if (!file) return;
    setImageUploading(true);
    setStatus("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/market/business/image", {
        method: "POST",
        body: formData,
      });
      const result = await readJson<{
        detail?: string;
        heroImageUrl?: string;
      }>(response);
      if (!response.ok || !result.heroImageUrl) {
        throw new Error(result.detail || "Business image upload failed.");
      }
      setStatus("Business artwork updated.");
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Business image upload failed."
      );
    } finally {
      setImageUploading(false);
    }
  }

  async function issueInvoice() {
    setPending("invoice");
    setStatus("");
    try {
      const response = await fetch("/api/market/business/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: invoiceInquiryId,
          amountWolo: Number.parseInt(invoiceAmount, 10),
          description: invoiceDescription,
        }),
      });
      const result = await readJson<{ detail?: string }>(response);
      if (!response.ok) throw new Error(result.detail || "Invoice failed.");
      setInvoiceDescription("");
      setStatus("Invoice delivered to the customer's Marketplace chat.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invoice failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="my-business" className="scroll-mt-24 overflow-hidden rounded-[2rem] border border-amber-100/14 bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.10),transparent_32%),radial-gradient(circle_at_100%_0%,rgba(20,184,166,0.07),transparent_28%),linear-gradient(145deg,rgba(14,20,31,0.98),rgba(4,8,15,0.98))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.28)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.32em] text-amber-100/70">
            <Store className="h-4 w-4" />
            My business · Marketplace
          </div>
          <h2 className="mt-2 font-serif text-3xl font-medium text-[#e8dfc5]">
            {business.shop.name}
          </h2>
          <div className="mt-1 text-sm text-slate-400">
            {streetLabel} · Awning {String(business.shop.slot).padStart(2, "0")}
          </div>
        </div>

        <button
          type="button"
          disabled={pending !== null}
          onClick={() =>
            void patchBusiness(
              {
                action: "display",
                displayEnabled: !business.shop.displayEnabled,
              },
              "display"
            )
          }
          className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
            business.shop.displayEnabled
              ? "border-emerald-200/25 bg-emerald-300/10 text-emerald-100"
              : "border-white/12 bg-white/[0.04] text-slate-300"
          }`}
        >
          {approvalNudge ? (
            <span
              aria-hidden
              className="mr-1 inline-flex animate-pulse text-lg leading-none text-amber-200"
            >
              →
            </span>
          ) : null}
          <Power className="h-4 w-4" />
          {business.shop.displayEnabled ? "Marketplace ON" : "Marketplace OFF"}
        </button>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded-[1.35rem] border border-white/9 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Gross revenue" value={`${business.grossRevenueWolo} WOLO`} icon={Coins} />
        <Metric label={`Kingdom tax · ${taxPercent}%`} value={`${business.taxDueWolo} WOLO due`} icon={Landmark} />
        <Metric label="Paid inquiries" value={String(business.paidInquiryCount)} icon={FileText} />
        <Metric label="Open invoices" value={String(business.openInvoiceCount)} icon={ReceiptText} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-[1.4rem] border border-white/9 bg-black/18 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
            Storefront settings
          </div>
          <div className="mt-4 overflow-hidden rounded-[1.15rem] border border-white/9 bg-black/20">
            <div
              className="aspect-[16/6] bg-cover bg-center"
              style={{
                backgroundImage: business.shop.heroImageUrl
                  ? `linear-gradient(rgba(2,6,15,0.12),rgba(2,6,15,0.46)),url("${business.shop.heroImageUrl}")`
                  : "linear-gradient(135deg,rgba(30,64,175,0.28),rgba(3,7,18,0.96))",
              }}
            />
            <label className="flex cursor-pointer items-center justify-center gap-2 border-t border-white/8 px-4 py-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.035] hover:text-white">
              <ImagePlus className="h-4 w-4" />
              {imageUploading
                ? "Uploading business artwork…"
                : "Change business image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                disabled={imageUploading}
                onChange={(event) =>
                  void uploadBusinessImage(event.target.files?.[0] || null)
                }
              />
            </label>
          </div>

          <label className="mt-4 block text-xs font-semibold text-slate-300">
            Business name
          </label>
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-100/25"
          />
          <label className="mt-4 block text-xs font-semibold text-slate-300">
            What you sell
          </label>
          <textarea
            value={offerDraft}
            onChange={(event) => setOfferDraft(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-amber-100/25"
          />
          <button
            type="button"
            disabled={pending !== null}
            onClick={() =>
              void patchBusiness(
                { action: "details", name: nameDraft, offer: offerDraft },
                "details"
              )
            }
            className="mt-3 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 disabled:opacity-50"
          >
            Save storefront
          </button>
        </div>

        <div className="rounded-[1.4rem] border border-white/9 bg-black/18 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/65">
            <Wrench className="h-3.5 w-3.5" /> Develop · 100 WOLO
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Ask Emaren to build something custom for this business. The paid request arrives as a Marketplace system card in your existing private thread.
          </p>
          <textarea
            value={developText}
            onChange={(event) => setDevelopText(event.target.value)}
            rows={4}
            placeholder="What should AoE2WAR build for your business?"
            className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-amber-100/25"
          />
          <button
            type="button"
            disabled={pending !== null || !developText.trim()}
            onClick={() =>
              void runPaidRequest({
                endpoint: "/api/market/business/develop",
                quoteBody: { requestText: developText },
                confirmIdKey: "requestId",
                pendingKey: "develop",
              }).then(() => setDevelopText(""))
            }
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-50 transition hover:bg-amber-300/15 disabled:opacity-50"
          >
            {pending === "develop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            Pay & send · 100 WOLO
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="rounded-[1.4rem] border border-white/9 bg-black/18 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
            Issue invoice
          </div>
          {business.customers.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              A customer must first submit a paid 100-WOLO inquiry before you can invoice them.
            </p>
          ) : (
            <>
              <select
                value={invoiceInquiryId}
                onChange={(event) => setInvoiceInquiryId(event.target.value)}
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#0a0f18] px-3 py-2.5 text-sm text-white"
              >
                {business.customers.map((customer) => (
                  <option key={customer.inquiryPublicId} value={customer.inquiryPublicId}>
                    {customer.displayName} · {customer.requestText.slice(0, 54)}
                  </option>
                ))}
              </select>
              <select
                value={invoiceAmount}
                onChange={(event) => setInvoiceAmount(event.target.value)}
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#0a0f18] px-3 py-2.5 text-sm text-white"
              >
                {[100, 200, 300, 400, 500, 1000, 2000, 5000].map((amount) => (
                  <option key={amount} value={amount}>{amount} WOLO</option>
                ))}
              </select>
              <textarea
                value={invoiceDescription}
                onChange={(event) => setInvoiceDescription(event.target.value)}
                rows={3}
                placeholder="What is this invoice for?"
                className="mt-3 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-amber-100/25"
              />
              <button
                type="button"
                disabled={pending !== null || !invoiceDescription.trim()}
                onClick={() => void issueInvoice()}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 disabled:opacity-50"
              >
                {pending === "invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                Issue invoice
              </button>
            </>
          )}
        </div>

        <div className="rounded-[1.4rem] border border-white/9 bg-black/18 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100/60">
            Kingdom tax
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold text-white">{business.taxDueWolo} WOLO</div>
              <div className="mt-1 text-xs text-slate-500">10% of verified gross business receipts</div>
            </div>
            <button
              type="button"
              disabled={pending !== null || business.taxDueWolo <= 0}
              onClick={() =>
                void runPaidRequest({
                  endpoint: "/api/market/business/tax",
                  quoteBody: {},
                  confirmIdKey: "taxPaymentId",
                  pendingKey: "tax",
                })
              }
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-50 transition hover:bg-emerald-300/15 disabled:opacity-50"
            >
              {pending === "tax" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />}
              Pay tax
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">Accrued<br /><strong className="text-slate-200">{business.taxAccruedWolo} WOLO</strong></div>
            <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">Paid<br /><strong className="text-slate-200">{business.taxPaidWolo} WOLO</strong></div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-[1.4rem] border border-white/9 bg-black/18 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
            Recent business activity
          </div>
          <Link href={business.shop.href} className="inline-flex items-center gap-1 text-xs font-semibold text-amber-100/80 hover:text-amber-50">
            Enter shop <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-3 space-y-2">
          {business.activity.length === 0 ? (
            <div className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-sm text-slate-400">
              No business transactions yet. Open the awning when you&apos;re ready.
            </div>
          ) : (
            business.activity.map((row) => (
              <div key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3">
                <span className={`text-sm font-black ${row.direction === "in" ? "text-emerald-200" : "text-amber-200"}`}>
                  {row.direction === "in" ? "+" : "-"}{row.amountWolo}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-200">{row.label}</div>
                  {row.detail ? <div className="truncate text-xs text-slate-500">{row.detail}</div> : null}
                </div>
                <span className="text-[10px] text-slate-600">{new Date(row.createdAt).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {status ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-slate-300">
          {status}
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Coins;
}) {
  return (
    <div className="bg-[#080d16]/95 p-4">
      <Icon className="h-4 w-4 text-amber-100/70" />
      <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
