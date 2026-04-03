"use client";

import dynamic from "next/dynamic";

const WalletConnector = dynamic(() => import("@/components/WalletConnector"), {
  ssr: false,
  loading: () => (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
      Loading wallet connector...
    </div>
  ),
});

export default function WalletConnectorLoader() {
  return <WalletConnector />;
}
