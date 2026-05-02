"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

export default function TreasuryActions({
  address,
  addressLabel,
  proofUrl,
  label = "wallet",
}: {
  address: string | null;
  addressLabel?: string;
  proofUrl: string | null;
  label?: string;
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
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        className="inline-flex min-w-0 max-w-full items-center rounded-full border border-white/10 bg-black/20 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
        title={address}
        aria-label={`Copy ${label}`}
      >
        <span className="truncate">{addressLabel || address}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-slate-200 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white"
        title={`Copy ${label}`}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {proofUrl ? (
        <a
          href={proofUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open ${label}`}
          aria-label={`Open ${label}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-500/10 text-emerald-100 transition hover:border-emerald-200/35 hover:bg-emerald-500/15"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}
