"use client";

import { Crown, LockKeyhole, ShieldCheck, Users } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

export type HeldChallengeTitle = {
  trophyId: number; trophyKey: string; championTitleId: string | null; displayName: string;
  imageUri: string | null; kind: string; eligible: boolean; reason: string | null; reasonCode: string | null;
  attackable: boolean; protected: boolean; teamSize: number; mode: string | null;
  roster: Array<{ userId: number; uid: string; displayName: string }>; custodyEpoch: string;
};

export default function ChallengeHeldTitles({ holderUid, holderName, selectedTeamId, onTeamChange, onTitlesLoaded, eligibilityOverride = false }: {
  holderUid: string; holderName: string; selectedTeamId: number | null;
  onTeamChange: (title: HeldChallengeTitle | null) => void;
  onTitlesLoaded: (titles: HeldChallengeTitle[], loading: boolean) => void;
  eligibilityOverride?: boolean;
}) {
  const [titles, setTitles] = useState<HeldChallengeTitle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedBeltUris, setFailedBeltUris] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const controller = new AbortController();
    setTitles([]); setError(null); setLoading(Boolean(holderUid)); onTitlesLoaded([], Boolean(holderUid));
    if (!holderUid) return () => controller.abort();
    void fetch(`/api/championships/held?holderUid=${encodeURIComponent(holderUid)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.detail || "Held titles are unavailable.");
        if (controller.signal.aborted) return;
        const rows = Array.isArray(payload.titles) ? payload.titles : [];
        setTitles(rows); onTitlesLoaded(rows, false);
      })
      .catch((cause) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Held titles are unavailable."); onTitlesLoaded([], false); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [holderUid, onTitlesLoaded]);
  if (!holderUid) return null;
  return (
    <section className="mt-4 rounded-2xl border border-emerald-200/15 bg-emerald-950/30 p-4" aria-label={`${holderName}'s held championships`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100/70"><Crown className="h-4 w-4" />{holderName}&apos;s championship stack</div>
      {loading ? <p className="mt-3 text-sm text-slate-300" role="status">Reading current belt custody…</p> : error ? <p className="mt-3 text-sm text-rose-100" role="alert">{error}</p> : titles.length === 0 ? <p className="mt-3 text-sm text-slate-400">No held championship. Fight for WOLO and the record.</p> : (
        <div className="mt-3 grid gap-2">
          {titles.map((title) => {
            const team = title.teamSize > 1;
            return <div key={title.trophyId} className={`rounded-xl border p-3 ${title.attackable && !selectedTeamId || selectedTeamId === title.trophyId ? "border-amber-200/30 bg-amber-300/[0.08]" : "border-white/10 bg-black/20"}`}>
              <div className="flex items-start gap-3">
                {title.imageUri && !failedBeltUris.has(title.imageUri) ? <Image src={title.imageUri} alt="" width={64} height={40} unoptimized onError={() => setFailedBeltUris((current) => new Set([...current, title.imageUri!]))} className="h-10 w-16 shrink-0 object-contain" /> : <Crown className="h-8 w-8 shrink-0 text-amber-200/65" />}
                <div className="min-w-0 flex-1"><div className="text-sm font-bold text-white">{title.displayName}</div>
                  {team ? <div className="mt-1 text-xs text-slate-300">{title.roster.map((member) => member.displayName).join(" + ")}</div> : <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-300">{title.attackable ? <ShieldCheck className="h-3 w-3 text-amber-200" /> : <LockKeyhole className="h-3 w-3 text-slate-500" />}{title.attackable ? "Automatic solo title stake" : title.protected ? "Protected behind the first eligible belt" : title.reason || "Not eligible"}</div>}
                </div>
              </div>
              {team ? <button type="button" disabled={(!title.eligible && !eligibilityOverride) || title.roster.length !== title.teamSize} onClick={() => onTeamChange(selectedTeamId === title.trophyId ? null : title)} className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-900/40 px-3 py-2 text-xs font-bold text-emerald-50 hover:bg-emerald-900/60 disabled:cursor-not-allowed disabled:opacity-45"><Users className="h-3.5 w-3.5" />{selectedTeamId === title.trophyId ? "Return to solo Challenge" : `Challenge for ${title.displayName}`}</button> : null}
              {team && (!title.eligible || title.roster.length !== title.teamSize) ? <p className="mt-2 text-xs text-slate-400">{title.reason || "Complete champion roster required"}</p> : null}
              {team && !title.eligible && eligibilityOverride ? <p className="mt-1 text-xs font-bold text-amber-100">Explicit Commissioner eligibility override applies.</p> : null}
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
