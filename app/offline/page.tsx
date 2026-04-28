import Link from "next/link";
import { CloudOff } from "lucide-react";

const OFFLINE_LINKS = [
  { href: "/app", label: "App" },
  { href: "/challenge", label: "Challenge" },
  { href: "/live-games", label: "Live Games" },
  { href: "/profile", label: "Profile" },
  { href: "/wolo", label: "WOLO" },
] as const;

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-3xl items-center justify-center py-10">
      <section className="w-full rounded-[14px] border border-white/10 bg-slate-950/80 p-6 text-center shadow-[0_24px_90px_rgba(0,0,0,0.35)] md:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-slate-300/20 bg-slate-300/10 text-slate-100">
          <CloudOff className="h-5 w-5" />
        </div>
        <div className="mt-5 text-xs uppercase tracking-[0.38em] text-slate-500">
          Offline
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">Last known war room</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-300">
          Wallet, wager, challenge, and check-in actions need a live connection.
        </p>
        <nav className="mt-6 flex flex-wrap justify-center gap-2">
          {OFFLINE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/25"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
