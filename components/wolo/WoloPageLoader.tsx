"use client";

import dynamic from "next/dynamic";

const WoloPageClient = dynamic(() => import("@/components/wolo/WoloPageClient"), {
  ssr: false,
  loading: () => <WoloPageSkeleton />,
});

export default function WoloPageLoader() {
  return <WoloPageClient />;
}

function WoloPageSkeleton() {
  return (
    <div className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#040814] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.34)] sm:p-6 lg:p-8">
        <div className="max-w-3xl space-y-4">
          <div className="text-[11px] uppercase tracking-[0.35em] text-amber-200/70">
            WoloChain
          </div>
          <div className="h-16 animate-pulse rounded-3xl border border-white/10 bg-white/5 sm:h-24" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-28 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/5" />
            <div className="h-28 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/5" />
          </div>
        </div>
      </section>
      <div className="h-56 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/5" />
    </div>
  );
}
