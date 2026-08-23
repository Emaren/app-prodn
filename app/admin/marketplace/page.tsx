import Link from "next/link";

import MarketplaceOwnerConsole from "@/components/market/MarketplaceOwnerConsole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminMarketplacePage() {
  return (
    <main className="mx-auto max-w-[96rem] px-4 py-8 text-white sm:px-6 lg:px-8">
      <header className="mb-6 overflow-hidden rounded-[2rem] border border-amber-100/14 bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.13),transparent_34%),linear-gradient(135deg,rgba(20,17,12,0.96),rgba(5,10,20,0.98))] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/65">
              Admin · Marketplace Command
            </div>

            <h1 className="mt-2 font-serif text-4xl text-[#efe1bf] sm:text-5xl">
              Kingdom Business Command
            </h1>

            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
              Create paid businesses for any citizen, assign proprietors,
              stage artwork, authorize pending charters, and command every
              active awning from one place.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            <Link
              href="/admin/media-assets"
              className="rounded-full border border-cyan-200/18 bg-cyan-300/[0.06] px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/35 hover:bg-cyan-300/10"
            >
              Media Armory
            </Link>

            <Link
              href="/market"
              className="rounded-full border border-amber-200/18 bg-amber-300/[0.06] px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-200/35 hover:bg-amber-300/10"
            >
              Open Marketplace
            </Link>

            <Link
              href="/admin"
              className="rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/25 hover:text-white"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <MarketplaceOwnerConsole commandMode />
    </main>
  );
}
