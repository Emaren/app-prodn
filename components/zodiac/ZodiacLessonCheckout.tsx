"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  LockKeyhole,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useState } from "react";

import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import { payAcademyAdvisorOnChain } from "@/lib/clientAcademyPayment";
import { WOLO_KEPLR_DOWNLOAD_URL, shortenAddress } from "@/lib/woloChain";

type LessonReceipt = {
  reservationId: number;
  amountWolo: number;
  txHash: string;
  proofUrl: string | null;
  contactHref: string;
};

export default function ZodiacLessonCheckout({
  advisorWalletAddress,
  advisorUid,
  amountWolo,
  paymentMemo,
}: {
  advisorWalletAddress: string | null;
  advisorUid: string;
  amountWolo: number;
  paymentMemo: string;
}) {
  const { uid, loading, loginWithSteam } = useUserAuth();
  const { address, connect, status } = useKeplr();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastTxHash, setBroadcastTxHash] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LessonReceipt | null>(null);

  const contactHref = `/contact-emaren?user=${encodeURIComponent(advisorUid)}`;

  async function reserveLesson() {
    if (busy || receipt) return;
    if (!uid) {
      loginWithSteam("/zodiac#first-lesson");
      return;
    }
    if (!advisorWalletAddress) {
      setError("Zodiac has not linked his Academy payout wallet yet.");
      return;
    }

    setBusy(true);
    setError(null);
    setBroadcastTxHash(null);
    try {
      const walletAddress = address || (await connect());
      const payment = await payAcademyAdvisorOnChain({
        advisorWalletAddress,
        amountWolo,
        memo: paymentMemo,
        fallbackWalletAddress: walletAddress,
      });
      setBroadcastTxHash(payment.transactionHash);

      const response = await fetch("/api/academy/zodiac/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: payment.transactionHash,
          fromAddress: payment.walletAddress,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (LessonReceipt & { ok: true })
        | { detail?: string; proofUrl?: string | null }
        | null;
      if (!response.ok || !payload || !("ok" in payload)) {
        throw new Error(
          (payload && "detail" in payload ? payload.detail : null) ||
            "Payment reached WoloChain, but the Academy receipt is still pending."
        );
      }

      setReceipt(payload);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "The lesson payment could not be completed."
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div className="rounded-[1.25rem] border border-emerald-200/24 bg-emerald-300/[0.08] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[1rem] bg-emerald-200 text-slate-950">
            <Check className="h-5 w-5" strokeWidth={3} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-emerald-50">
              First lesson reserved
            </div>
            <div className="mt-1 text-xs leading-5 text-emerald-100/70">
              {receipt.amountWolo} WOLO verified on wolo-1. Open the private
              line and bring your replay.
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Link
            href={receipt.contactHref}
            className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-200 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-100"
          >
            Enter Zodiac’s war room
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          {receipt.proofUrl ? (
            <a
              href={receipt.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-100/18 bg-black/15 px-4 text-xs font-bold text-emerald-50 transition hover:bg-white/[0.05]"
            >
              WoloChain proof
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/22 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-100/60">
            First lesson
          </div>
          <div className="mt-1 text-3xl font-black text-white">
            {amountWolo}{" "}
            <span className="text-base font-bold text-amber-100">WOLO</span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-violet-100/14 bg-violet-300/[0.07] px-3 py-2">
          <Image
            src="/legacy/wolo-logo-transparent.webp"
            alt=""
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-100">
            wolo-1
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
        <LockKeyhole className="h-3.5 w-3.5 text-emerald-200" />
        Signed in Keplr. Paid directly to the advisor.
      </div>
      {advisorWalletAddress ? (
        <div className="mt-2 font-mono text-[10px] text-slate-600">
          Advisor · {shortenAddress(advisorWalletAddress, 10, 7)}
        </div>
      ) : (
        <div className="mt-2 text-xs text-amber-100/70">
          WOLO checkout opens when Zodiac links his advisor wallet.
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200/18 bg-rose-300/[0.07] px-3 py-2.5 text-xs leading-5 text-rose-100">
          {error}
          {broadcastTxHash ? (
            <div className="mt-1 break-all font-mono text-[10px] text-rose-100/60">
              Keep this tx: {broadcastTxHash}
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={reserveLesson}
        disabled={busy || loading || !advisorWalletAddress}
        className="group mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 px-5 text-sm font-black text-slate-950 shadow-[0_18px_45px_rgba(251,191,36,0.18)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {broadcastTxHash ? "Verifying payment…" : "Waiting for Keplr…"}
          </>
        ) : !uid ? (
          <>
            <WalletCards className="h-4 w-4" />
            Sign in to reserve
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Reserve first lesson
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </>
        )}
      </button>

      {status === "not_installed" ? (
        <a
          href={WOLO_KEPLR_DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center gap-1 text-xs font-semibold text-violet-100 hover:text-white"
        >
          Install Keplr
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : !advisorWalletAddress ? (
        <Link
          href={contactHref}
          className="mt-3 inline-flex w-full items-center justify-center text-xs font-semibold text-violet-100 hover:text-white"
        >
          Ask Zodiac to open a seat →
        </Link>
      ) : null}
    </div>
  );
}
