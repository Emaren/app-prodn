import Link from "next/link";
import { ArrowLeft, ArrowRight, Crown, Store } from "lucide-react";
import { notFound } from "next/navigation";

import {
  getMarketplaceKingdomBusiness,
  MARKETPLACE_KINGDOM_BUSINESSES,
} from "@/lib/marketplaceKingdomBusinesses";

export const dynamic = "force-static";

export function generateStaticParams() {
  return MARKETPLACE_KINGDOM_BUSINESSES.map((business) => ({ slug: business.slug }));
}

export default async function MarketplaceKingdomBusinessPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const business = getMarketplaceKingdomBusiness(slug);
  if (!business) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <section className="relative isolate overflow-hidden rounded-[2.2rem] border border-white/10 bg-[radial-gradient(circle_at_82%_18%,rgba(59,130,246,0.13),transparent_32%),radial-gradient(circle_at_12%_82%,rgba(245,158,11,0.08),transparent_30%),linear-gradient(145deg,#0b1220,#03060d_76%)] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.42)] sm:p-10 lg:p-14">
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/28 to-transparent" />
        <Link href={`/market#${business.streetKey}`} className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/25 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-white/24 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to the Marketplace
        </Link>
        <div className="mt-16 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-100/18 bg-amber-300/[0.06] px-3 py-1 text-[9px] font-black uppercase tracking-[0.22em] text-amber-100">Founding Kingdom awning</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
              {business.streetKey.replace("-", " ")} · Awning {String(business.slot).padStart(2, "0")}
            </span>
          </div>
          <p className="mt-8 text-[10px] font-black uppercase tracking-[0.32em] text-slate-500">{business.eyebrow}</p>
          <h1 className="mt-3 font-serif text-5xl leading-none tracking-[-0.045em] text-[#e9dfc3] sm:text-7xl">{business.name}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">{business.offer}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {business.destinationHref && business.destinationLabel ? (
              <Link href={business.destinationHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-amber-200">
                {business.destinationLabel}<ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex min-h-12 items-center justify-center rounded-full border border-sky-100/16 bg-sky-300/[0.06] px-6 py-3 text-sm font-bold text-sky-100/80">Service counter forming</span>
            )}
            {business.secondaryHref && business.secondaryLabel ? (
              <Link href={business.secondaryHref} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-amber-100/16 bg-amber-300/[0.05] px-6 py-3 text-sm font-bold text-amber-100 transition hover:border-amber-100/28 hover:bg-amber-300/[0.09]">
                {business.secondaryLabel}<ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
            <Link href="/market" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-black/22 px-6 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/24 hover:text-white">Walk the streets</Link>
          </div>
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <article className="rounded-[1.7rem] border border-white/9 bg-slate-950/60 p-6">
          <Store className="h-5 w-5 text-sky-100/70" />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">Inside the tent</p>
          <h2 className="mt-2 font-serif text-3xl text-[#dfd7c4]">A real doorway, not a dead awning.</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">{business.detail}</p>
        </article>
        <article className="rounded-[1.7rem] border border-amber-100/12 bg-[linear-gradient(145deg,rgba(42,31,10,0.72),rgba(3,7,16,0.96))] p-6">
          <Crown className="h-5 w-5 text-amber-100/75" />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/50">Counter note</p>
          <div className="mt-2 font-serif text-2xl text-[#e8dfc5]">{business.priceLabel || "Kingdom service"}</div>
          <p className="mt-3 text-sm leading-6 text-slate-400">{business.statusNote || "The service itself already exists elsewhere in AoE2WAR; this tent makes it part of the Marketplace economy and physical world."}</p>
        </article>
      </section>
    </main>
  );
}
