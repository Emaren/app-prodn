"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export default function TreasuryActions({
  address,
  proofUrl,
}: {
  address: string | null;
  proofUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
        title="Copy treasury wallet"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
      {proofUrl ? (
        <a
          href={proofUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:border-emerald-200/35 hover:bg-emerald-500/15"
        >
          View
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}
