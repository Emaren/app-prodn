"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

const REFRESH_INTERVAL_MS = 20_000;

export default function KingdomIntelligenceRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(poll);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.06]"
      aria-busy={pending}
    >
      <RefreshCw className={"h-3.5 w-3.5 " + (pending ? "animate-spin" : "")} />
      {pending ? "Refreshing" : "Refresh signal"}
    </button>
  );
}
