"use client";

import { useId } from "react";

type FounderBonusType = "participants" | "winner";

function previewCopy(
  bonusType: FounderBonusType,
  amountWolo: number,
  participantCount: number
) {
  if (bonusType === "winner") {
    return `Founders Win ${amountWolo.toLocaleString()} WOLO -> ${amountWolo.toLocaleString()} to winner`;
  }

  const safeParticipantCount =
    Math.max(
      2,
      participantCount
    );

  if (
    amountWolo > 0 &&
    amountWolo %
      safeParticipantCount !==
      0
  ) {
    return `Founders Bonus ${amountWolo.toLocaleString()} WOLO -> ${safeParticipantCount} players · total must divide evenly`;
  }

  const splitAmount =
    safeParticipantCount > 0
      ? amountWolo /
        safeParticipantCount
      : 0;

  return `Founders Bonus ${amountWolo.toLocaleString()} WOLO -> ${splitAmount.toLocaleString()} each x ${safeParticipantCount} players`;
}

export default function FounderBonusModal({
  open,
  marketTitle,
  participantCount,
  bonusType,
  amountValue,
  noteValue,
  saving,
  error,
  onClose,
  onBonusTypeChange,
  onAmountChange,
  onNoteChange,
  onSubmit,
}: {
  open: boolean;
  marketTitle: string;
  participantCount: number;
  bonusType: FounderBonusType;
  amountValue: string;
  noteValue: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onBonusTypeChange: (value: FounderBonusType) => void;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const amountInputId = useId();
  const noteInputId = useId();

  if (!open) {
    return null;
  }

  const amountWolo = Number.parseInt(amountValue || "0", 10);
  const safeAmountWolo = Number.isFinite(amountWolo) ? Math.max(0, amountWolo) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.34em] text-amber-300/70">
              Founder Bonus
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">{marketTitle}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onBonusTypeChange("participants")}
            className={`rounded-[1.2rem] border px-4 py-3 text-left transition ${
              bonusType === "participants"
                ? "border-amber-300/24 bg-amber-400/12 text-amber-50"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
            }`}
          >
            <div className="text-sm font-semibold">Founders Bonus</div>
            <div className="mt-1 text-xs text-slate-400">
              Split evenly between every player in the match.
            </div>
          </button>

          <button
            type="button"
            onClick={() => onBonusTypeChange("winner")}
            className={`rounded-[1.2rem] border px-4 py-3 text-left transition ${
              bonusType === "winner"
                ? "border-sky-300/24 bg-sky-400/12 text-sky-50"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
            }`}
          >
            <div className="text-sm font-semibold">Founders Win</div>
            <div className="mt-1 text-xs text-slate-400">Winner takes the full amount.</div>
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="block">
            <label htmlFor={amountInputId} className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Amount</label>
            <div className="mt-2 flex items-center rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-2">
              <input
                id={amountInputId}
                inputMode="numeric"
                pattern="[0-9]*"
                value={amountValue}
                onChange={(event) =>
                  onAmountChange(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                }
                className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-500"
                placeholder={bonusType === "winner" ? "1000" : String(Math.max(2, participantCount) * 2)}
              />
              <label htmlFor={amountInputId} className="cursor-text select-none text-xs uppercase tracking-[0.2em] text-slate-500">WOLO</label>
            </div>
          </div>

          <div className="block">
            <label htmlFor={noteInputId} className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Note</label>
            <input
              id={noteInputId}
              value={noteValue}
              onChange={(event) => onNoteChange(event.target.value.slice(0, 160))}
              className="mt-2 w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="Optional note"
            />
          </div>
        </div>

        <div className="mt-4 rounded-[1.2rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300">
          {previewCopy(
            bonusType,
            safeAmountWolo,
            participantCount
          )}
        </div>

        {error ? (
          <div className="mt-3 rounded-[1.1rem] border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="rounded-full border border-amber-200/16 bg-[linear-gradient(135deg,#fde68a_0%,#f5c95f_28%,#d7a73e_72%,#8c5e10_100%)] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : bonusType === "winner"
                ? "Save Founders Win"
                : "Save Founders Bonus"}
          </button>
        </div>
      </div>
    </div>
  );
}
