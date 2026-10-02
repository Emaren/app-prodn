"use client";

import { useEffect, useState } from "react";
import { CHALLENGE_DISPLAY_STORAGE_KEY, normalizeChallengeDisplay, type ChallengeLayout, type ChallengePresentationVersion } from "@/lib/challengePresentation";

export function useChallengeDisplay(requestedLayout?: string | null, requestedVersion?: string | null) {
  const [display, setDisplay] = useState(() => normalizeChallengeDisplay({ layout: requestedLayout, version: requestedVersion === "1" ? 1 : 2 }));
  useEffect(() => {
    try {
      const stored = normalizeChallengeDisplay(JSON.parse(window.localStorage.getItem(CHALLENGE_DISPLAY_STORAGE_KEY) || "{}"));
      setDisplay(normalizeChallengeDisplay({
        layout: requestedLayout || stored.layout,
        version: requestedVersion ? Number(requestedVersion) : stored.version,
      }));
    } catch { /* Private browsing may deny storage; the rail still works. */ }
  }, [requestedLayout, requestedVersion]);
  const change = (next: { layout: ChallengeLayout; version: ChallengePresentationVersion }) => {
    setDisplay(next);
    try { window.localStorage.setItem(CHALLENGE_DISPLAY_STORAGE_KEY, JSON.stringify(next)); } catch { /* Optional persistence. */ }
  };
  return { ...display, change };
}

function itemClass(active: boolean) {
  return `min-w-8 rounded-full px-2.5 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-100 ${active ? "bg-amber-100 text-slate-950" : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"}`;
}

export default function ChallengeDisplayRail({ layout, version, onChange }: {
  layout: ChallengeLayout;
  version: ChallengePresentationVersion;
  onChange: (next: { layout: ChallengeLayout; version: ChallengePresentationVersion }) => void;
}) {
  return (
    <section className="flex min-h-10 items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/70 px-3 py-1.5 shadow-[0_12px_44px_rgba(0,0,0,0.26)] backdrop-blur" aria-label="Challenge display settings">
      <span className="text-[8px] font-black uppercase tracking-[0.24em] text-slate-500">Display</span>
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-full border border-white/[0.07] bg-black/25 p-0.5" aria-label="Challenge layout">
          {([ ["basic", "B", "Basic"], ["advanced", "A", "Advanced"], ["extreme", "E", "Extreme"] ] as const).map(([key, label, title]) => (
            <button key={key} type="button" title={title} aria-pressed={layout === key} onClick={() => onChange({ layout: key, version })} className={itemClass(layout === key)}>{label}</button>
          ))}
        </div>
        <div className="group/version relative">
          <button type="button" onClick={() => onChange({ layout, version: version === 1 ? 2 : 1 })} className={itemClass(true)} title={`Version ${version} · click to advance`} aria-label={`Challenge presentation Version ${version}; switch version`}>V{version}</button>
          <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-1 flex gap-1 rounded-full border border-white/10 bg-slate-950 p-1 opacity-0 shadow-xl transition group-hover/version:pointer-events-auto group-hover/version:opacity-100 group-focus-within/version:pointer-events-auto group-focus-within/version:opacity-100" aria-label="Challenge versions">
            {([1, 2] as const).map((value) => <button key={value} type="button" aria-pressed={version === value} onClick={() => onChange({ layout, version: value })} className={itemClass(version === value)}>V{value}</button>)}
          </div>
        </div>
      </div>
    </section>
  );
}
