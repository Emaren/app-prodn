import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Coins,
  MessageCircle,
  ShieldCheck,
  Store,
  Wrench,
} from "lucide-react";

import {
  findMarketplaceShopBySlug,
  MARKETPLACE_STANDARD_CHARTER_WOLO,
} from "@/lib/marketplaceShops";

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const shop = findMarketplaceShopBySlug(
      decodeURIComponent(slug).trim().toLowerCase()
    );

    return {
      title: shop?.name ?? "Marketplace Shop",
      description:
        shop?.offer ??
        "A merchant awning inside the AoE2WAR Marketplace.",
    };
  });
}

export default async function MarketplaceShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const shop = findMarketplaceShopBySlug(
    decodeURIComponent(slug).trim().toLowerCase()
  );

  if (!shop || shop.slug !== "onager-repair" || !shop.heroImage) {
    notFound();
  }

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-8 sm:py-5">
      <section className="relative isolate min-h-[42rem] overflow-hidden rounded-[2.2rem] border border-teal-100/16 bg-[#03060c] shadow-[0_40px_125px_rgba(0,0,0,0.45)] sm:min-h-[48rem]">
        <Image
          src={shop.heroImage}
          alt="Jim's torchlit Onager Repair works inside the AoE2WAR Marketplace"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,12,0.93)_0%,rgba(2,6,12,0.62)_43%,rgba(2,6,12,0.16)_74%,rgba(2,6,12,0.36)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#03060c] via-transparent to-black/25" />

        <div className="relative flex min-h-[42rem] max-w-3xl flex-col justify-between p-6 sm:min-h-[48rem] sm:p-10 lg:p-14">
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
              <Link
                href={shop.counterHref}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-teal-100/20 bg-teal-200/[0.09] px-6 py-3 text-sm font-bold text-teal-50 transition hover:-translate-y-0.5 hover:border-teal-100/40 hover:bg-teal-200/[0.14]"
              >
                <MessageCircle className="h-4 w-4" />
                Talk to Jim
              </Link>
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

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-[1.6rem] border border-teal-100/14 bg-[linear-gradient(145deg,rgba(8,32,34,0.9),rgba(3,7,16,0.96))] p-6">
          <Wrench className="h-5 w-5 text-teal-100" />
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-teal-100/55">
            The craft
          </p>
          <h2 className="mt-2 font-serif text-2xl text-slate-100">
            Siege repair
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            A proper shop for damaged arms, wheels, frames, ropes, and all the
            other reasons an onager has stopped being somebody else's problem.
          </p>
        </article>

        <article className="rounded-[1.6rem] border border-amber-100/14 bg-[linear-gradient(145deg,rgba(31,24,8,0.82),rgba(3,7,16,0.96))] p-6">
          <Coins className="h-5 w-5 text-amber-100" />
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-100/55">
            Founding charter
          </p>
          <h2 className="mt-2 font-serif text-2xl text-slate-100">
            {MARKETPLACE_STANDARD_CHARTER_WOLO} WOLO
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Jim's founding shop proposal was paid and verified on WoloChain.
            The charter is already satisfied.
          </p>
        </article>

        <article className="rounded-[1.6rem] border border-sky-100/14 bg-[linear-gradient(145deg,rgba(8,18,38,0.88),rgba(3,7,16,0.96))] p-6">
          <ShieldCheck className="h-5 w-5 text-sky-100" />
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-sky-100/55">
            Counter status
          </p>
          <h2 className="mt-2 font-serif text-2xl text-slate-100">
            Open for trade
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            The first version of the shop opens the door and connects customers
            directly to Jim. Orders, invoices, and business controls come next.
          </p>
        </article>
      </section>
    </main>
  );
}
