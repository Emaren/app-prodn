"use client";

import { useEffect, useState } from "react";
import Kt84Cockpit from "@/components/kingdom-traders/Kt84Cockpit";

/**
 * Loads no original money source. Public visitors see a simple entry panel;
 * all sanitized telemetry requests are independently admin-authenticated.
 */
export default function Kt84CockpitEntry() {
  const [opened,setOpened] = useState(false);
  useEffect(()=>{
    if (window.location.hash === "#cockpit") setOpened(true);
  },[]);
  return (
    <section id="cockpit" aria-label="Protected Kingdom Traders PAPER observatory" className="scroll-mt-24">
      {!opened ? <div className="rounded-[1.5rem] border border-amber-200/20 bg-slate-950/75 p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200">Owner-only observatory</p>
        <h2 className="mt-3 text-2xl font-black">KT84 Stellar research deck</h2>
        <p className="mt-3 max-w-xl text-sm text-slate-300">
          Six provider roles, immutable PAPER evidence, a nonspending wallet dock and an explicit US$10 HOLD.
          Financial values require signed owner-authenticated evidence.
        </p>
        <button type="button" onClick={()=>setOpened(true)}
          className="mt-5 rounded-xl border border-amber-200/35 bg-amber-200/10 px-5 py-3 text-sm font-bold text-amber-100 hover:bg-amber-200/20">
          Open research deck
        </button>
      </div> : <Kt84Cockpit/>}
    </section>
  );
}
