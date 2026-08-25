"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function WarGraphError({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-[68vh] place-items-center px-3 py-12">
      <section className="w-full max-w-xl rounded-[1.8rem] border border-amber-200/[0.17] bg-[linear-gradient(150deg,rgba(47,30,12,0.26),rgba(4,11,18,0.98)_58%)] p-6 text-center shadow-[0_32px_90px_rgba(0,0,0,0.5)] sm:p-8" role="alert">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-amber-200/20 bg-amber-300/[0.07] text-amber-200">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="mt-5 text-[9px] font-black uppercase tracking-[0.24em] text-amber-200/55">Fail closed</p>
        <h1 className="mt-2 font-serif text-2xl font-black text-amber-50">The board is holding position</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
          WarGraph could not prove a safe current state, so no movement or reward has been shown. Try the board again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mx-auto mt-6 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-100/[0.42] bg-[linear-gradient(145deg,#f2d184,#b77825)] px-5 text-[10px] font-black uppercase tracking-[0.17em] text-[#080c11] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100/80 motion-reduce:transition-none"
        >
          <RotateCcw className="h-4 w-4" />
          Reopen WarGraph
        </button>
      </section>
    </div>
  );
}
