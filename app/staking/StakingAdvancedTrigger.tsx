"use client";

import type { ReactNode } from "react";
import { ArrowDownRight } from "lucide-react";

export default function StakingAdvancedTrigger({ children }: { children: ReactNode }) {
  function openAdvancedView() {
    const target = document.getElementById("staking-advanced");
    const url = new URL(window.location.href);
    url.searchParams.set("view", "advanced");
    url.hash = "staking-advanced";
    window.history.replaceState(null, "", url);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <button
      type="button"
      onClick={openAdvancedView}
      className="group inline-flex max-w-full items-center gap-3 rounded-[1.15rem] border border-white/0 py-1 pr-2 text-left transition hover:border-white/10 hover:bg-white/[0.035] focus:outline-none focus-visible:border-emerald-200/40 focus-visible:bg-white/[0.045]"
      title="Open advanced staking view"
      aria-label="Open advanced staking view"
    >
      {children}
      <span className="ml-1 hidden rounded-full border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition group-hover:border-emerald-200/25 group-hover:text-emerald-100 sm:inline-flex">
        <ArrowDownRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
