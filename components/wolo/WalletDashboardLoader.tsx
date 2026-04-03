"use client";

import dynamic from "next/dynamic";

const WalletDashboardClient = dynamic(() => import("@/components/wolo/WalletDashboardClient"), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div className="h-48 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
      <div className="h-32 animate-pulse rounded-3xl border border-white/10 bg-white/5" />
    </div>
  ),
});

export default function WalletDashboardLoader() {
  return <WalletDashboardClient />;
}
