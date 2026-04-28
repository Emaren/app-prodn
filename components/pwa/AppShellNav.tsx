"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletCards } from "lucide-react";
import { APP_NAV_ITEMS } from "@/components/pwa/MobileFloatingNav";

export default function AppShellNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="relative min-h-[calc(100dvh-7rem)]">
      <aside className="fixed left-[max(1rem,calc((100vw-72rem)/2+1rem))] top-32 z-30 hidden w-20 rounded-[10px] border border-white/10 bg-slate-950/80 p-2 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:block">
        <Link
          href="/app"
          className="mb-2 flex h-12 items-center justify-center rounded-[8px] border border-amber-200/20 bg-amber-300/10 text-amber-100"
          title="AoE2HDBets app"
          aria-label="AoE2HDBets app"
        >
          <WalletCards className="h-5 w-5" />
        </Link>
        <nav className="space-y-1">
          {APP_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                className={`flex h-12 items-center justify-center rounded-[8px] border text-xs transition ${
                  active
                    ? "border-sky-200/40 bg-sky-300/15 text-sky-100"
                    : "border-white/5 bg-white/[0.03] text-slate-300 hover:border-white/15 hover:bg-white/[0.06]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-24">{children}</div>
    </div>
  );
}
