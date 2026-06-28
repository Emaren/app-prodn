"use client";

import { useState } from "react";

const WOLOCHAIN_EXPLORER_URL = "https://wolochain.valopers.com/";

type TreasuryActionsProps = {
  address: string | null;
  addressLabel?: string | null;
  proofUrl?: string | null;
  label: string;
};

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
        <path
          d="M20 6 9 17l-5-5"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExplorerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path
        d="M7 17 17 7"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 11v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18V6.5A1.5 1.5 0 0 1 6.5 5H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TreasuryActions({
  address,
  addressLabel,
  label,
}: TreasuryActionsProps) {
  const [copied, setCopied] = useState(false);
  const cleanAddress = address?.trim() || "";
  const displayAddress = cleanAddress || addressLabel || "Wallet pending";

  async function handleCopy() {
    if (!cleanAddress) return;

    await copyTextToClipboard(cleanAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="rounded-[1rem] border border-white/10 bg-black/15 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="text-[9px] uppercase tracking-[0.22em] text-slate-500">
        Address
      </div>

      <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <div
          title={cleanAddress || displayAddress}
          className="min-w-0 flex-1 select-all break-all font-mono text-[10.5px] font-semibold leading-4 text-slate-100 sm:text-[11px]"
        >
          {displayAddress}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!cleanAddress}
            aria-label={copied ? `${label} address copied` : `Copy ${label} address`}
            title={copied ? "Copied" : "Copy address"}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${
              copied
                ? "border-emerald-300/45 bg-emerald-400/12 text-emerald-100"
                : "border-white/12 bg-white/5 text-white/85 hover:border-emerald-300/35 hover:bg-emerald-400/10 hover:text-emerald-100"
            }`}
          >
            <CopyIcon copied={copied} />
          </button>

          <a
            href={WOLOCHAIN_EXPLORER_URL}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${label} in WoloChain explorer`}
            title="Open Explorer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-400/10 text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-400/15"
          >
            <ExplorerIcon />
          </a>
        </div>
      </div>
    </div>
  );
}
