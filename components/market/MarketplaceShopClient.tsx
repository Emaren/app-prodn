"use client";

import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight, Coins, ShieldCheck, Store, Wrench } from "lucide-react";

import MarketplaceInquiryComposer from "@/components/market/MarketplaceInquiryComposer";

export default function MarketplaceShopClient({
  shop,
}: {
  shop: {
    slug: string;
    name: string;
    offer: string;
    proprietorLabel: string;
    ownerUid: string | null;
    displayEnabled: boolean;
    heroImageUrl: string | null;
  };
}) {
  return (
    <main className="space-y-6 py-3 text-white sm:space-y-8 sm:py-5">
      <section className="relative isolate min-h-[34rem] overflow-hidden rounded-[2.2rem] border border-teal-100/16 bg-[#03060c] shadow-[0_40px_125px_rgba(0,0,0,0.45)] sm:min-h-[38rem]">
        {shop.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.heroImageUrl}
            alt={`${shop.name} inside the AoE2WAR Marketplace`}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,12,0.88)_0%,rgba(2,6,12,0.50)_44%,rgba(2,6,12,0.10)_76%,rgba(2,6,12,0.30)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#03060c] via-transparent to-black/25" />

        <div className="relative flex min-h-[34rem] max-w-3xl flex-col justify-between p-6 sm:min-h-[38rem] sm:p-10 lg:p-12">
          <Link
            href="/market#second-street"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/13 bg-black/35 px-4 py-2 text-xs font-semibold text-slate-200 backdrop-blur-xl transition hover:border-teal-100/30 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the Marketplace
          </Link>

          <div className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-100/18 bg-teal-300/[0.08] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.23em] text-teal-100">
                <Store className="h-3.5 w-3.5" />
                2nd Street · Awning 01
              </span>
              <span className="rounded-full border border-amber-100/16 bg-amber-200/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100">
                Founding merchant
              </span>
            </div>

            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.34em] text-teal-100/65">
              Proprietor · {shop.proprietorLabel}
            </p>
            <h1 className="market-display-title market-display-gold mt-3 max-w-4xl font-serif text-5xl font-medium leading-[0.98] tracking-[-0.045em] sm:text-7xl">
              {shop.name}
            </h1>
            <p className="mt-5 max-w-2xl font-serif text-xl font-medium leading-8 text-slate-200">
              {shop.offer}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#counter"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-teal-100/24 bg-teal-200/[0.11] px-6 py-3 text-sm font-bold text-teal-50 transition hover:-translate-y-0.5 hover:border-teal-100/45 hover:bg-teal-200/[0.16]"
              >
                <Coins className="h-4 w-4" />
                Open counter · 100 WOLO
                <ArrowDown className="h-4 w-4" />
              </a>
              <Link
                href="/market#second-street"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-black/35 px-6 py-3 text-sm font-semibold text-slate-200 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/25 hover:text-white"
              >
                Return to the street
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <article className="flex items-center gap-4 rounded-[1.35rem] border border-teal-100/14 bg-[linear-gradient(145deg,rgba(8,32,34,0.86),rgba(3,7,16,0.96))] p-4 sm:p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-teal-100/15 bg-teal-300/[0.07]">
            <Wrench className="h-4 w-4 text-teal-100" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-teal-100/50">The craft</p>
            <h2 className="mt-1 font-serif text-xl text-slate-100">Siege repair</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Arms, wheels, frames, ropes &amp; field damage.</p>
          </div>
        </article>

        <article className="flex items-center gap-4 rounded-[1.35rem] border border-amber-100/14 bg-[linear-gradient(145deg,rgba(31,24,8,0.78),rgba(3,7,16,0.96))] p-4 sm:p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-100/15 bg-amber-300/[0.07]">
            <Coins className="h-4 w-4 text-amber-100" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-100/50">Front counter</p>
            <h2 className="mt-1 font-serif text-xl text-slate-100">100 WOLO</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Paid directly to {shop.proprietorLabel} with the first request.</p>
          </div>
        </article>

        <article className="flex items-center gap-4 rounded-[1.35rem] border border-sky-100/14 bg-[linear-gradient(145deg,rgba(8,18,38,0.84),rgba(3,7,16,0.96))] p-4 sm:p-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-sky-100/15 bg-sky-300/[0.06]">
            <ShieldCheck className="h-4 w-4 text-sky-100" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-sky-100/50">Counter status</p>
            <h2 className="mt-1 font-serif text-xl text-slate-100">{shop.displayEnabled ? "Open for trade" : "Shutters down"}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Awning visibility is controlled by the proprietor.</p>
          </div>
        </article>
      </section>

      <section id="counter" className="scroll-mt-24 rounded-[2rem] border border-teal-100/14 bg-[radial-gradient(circle_at_0%_0%,rgba(20,184,166,0.11),transparent_35%),linear-gradient(145deg,rgba(5,27,30,0.96),rgba(3,7,16,0.98))] p-5 sm:p-7">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-100/60">The counter</p>
          <h2 className="mt-2 font-serif text-3xl font-medium text-[#e6dfc8]">What do you need?</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">Write the request in your own words. Once the 100 WOLO payment is verified, the request is delivered to {shop.proprietorLabel} as a Marketplace system card inside your existing private chat.</p>
        </div>
        {shop.displayEnabled ? (
          <div className="mt-6 max-w-3xl">
            <MarketplaceInquiryComposer shopSlug={shop.slug} shopName={shop.name} />
          </div>
        ) : (
          <div className="mt-6 max-w-3xl rounded-2xl border border-white/8 bg-black/20 px-4 py-4 text-sm text-slate-400">This merchant has the awning switched off. No new paid inquiries are being accepted.</div>
        )}
      </section>
    </main>
  );
}
