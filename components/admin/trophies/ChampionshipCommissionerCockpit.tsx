"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Crown, RefreshCw, Shield } from "lucide-react";
import { championshipCountdownSeconds, type ChampionshipProjection } from "@/lib/challengeChampionshipProtocol";
import { championshipBeltPolicy } from "@/lib/champions/beltPolicy";
import type { TrophyRow, TrophyUserOption } from "@/lib/trophies/types";

type ReviewRow = ChampionshipProjection & { id: number };
type DisputeRow = {
  id: number; trophyId: number; titleName: string; custodyEpoch: string; frozenBountyWolo: number | null;
  contenderSnapshot: Array<{ challengeId: number; roster: Array<{ userId: number; steamId: string; seat: number }> }>;
};
type TransferGroup = {
  id: number; titleName: string; requestKey: string; appStatus: string; nftStatus: string;
  reasonCode: string | null; frozenBountyWolo: number; bountyPayoutId: number | null;
  seats: Array<{ seat: number; nftId: string; nftClassId: string | null; status: string;
    expectedOwnerAddress: string | null; recipientAddress: string | null; txHash: string | null; errorCode: string | null }>;
};
type CommissionerAction = "protect" | "veto" | "extend" | "force_default" | "review" | "acknowledge_evidence";
const ACTIONS: Array<{ action: CommissionerAction; label: string }> = [
  { action: "protect", label: "Protect champion" },
  { action: "veto", label: "Veto defense" },
  { action: "extend", label: "Extend / rematch" },
  { action: "force_default", label: "Evaluate default" },
  { action: "review", label: "Hold for review" },
  { action: "acknowledge_evidence", label: "Record exceptional evidence" },
];
const fieldClass = "w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-300 focus:outline-none";

function timer(seconds: number) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function ChampionshipCommissionerCockpit({ trophies, users, onCustodyChanged }: {
  trophies: TrophyRow[]; users: TrophyUserOption[]; onCustodyChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [clock, setClock] = useState({ serverNow: "", anchor: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<TransferGroup[]>([]);
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [extensionHours, setExtensionHours] = useState("24");
  const [trophyId, setTrophyId] = useState("");
  const [seats, setSeats] = useState<string[]>(["", "", "", ""]);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [override, setOverride] = useState(false);
  const selected = trophies.find(trophy => trophy.id === Number(trophyId));
  const teamSize = selected ? championshipBeltPolicy(selected).teamSize : 1;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/championship-challenges", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.challenges)) throw new Error(payload.detail || "Championship review is unavailable.");
      setRows(payload.challenges.filter((row: ReviewRow) => row && Number.isSafeInteger(row.id) && Array.isArray(row.participants)));
      setDisputes(Array.isArray(payload.disputes) ? payload.disputes.filter((row: DisputeRow) => row && Number.isSafeInteger(row.id) && Array.isArray(row.contenderSnapshot)) : []);
      setClock({ serverNow: payload.serverNow || new Date().toISOString(), anchor: performance.now() });
      setError(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Championship review is unavailable."); }
    try {
      const response = await fetch("/api/admin/championship-transfers", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.groups)) throw new Error(payload.detail || "Transfer evidence is unavailable.");
      setTransfers(payload.groups.filter((group: TransferGroup) => group && Array.isArray(group.seats)));
      setTransferError(null);
    } catch (failure) { setTransferError(failure instanceof Error ? failure.message : "Transfer evidence is unavailable."); }
  }, []);
  useEffect(() => {
    void load();
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(poll);
  }, [load]);
  useEffect(() => {
    const tick = () => setElapsed(clock.anchor ? Math.max(0, performance.now() - clock.anchor) : 0);
    tick(); const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [clock]);

  async function act(row: ReviewRow, action: CommissionerAction) {
    setBusy(true); setNotice(null); setError(null);
    try {
      const response = await fetch("/api/admin/championship-challenges", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: row.id, action, reason: reasons[row.id]?.trim(), extensionHours: Number(extensionHours) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Commissioner action failed.");
      setNotice("Commissioner disposition recorded. Inspect the custody and payment evidence below.");
      await load(); await onCustodyChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Commissioner action failed."); }
    finally { setBusy(false); }
  }
  async function assign() {
    if (!selected) return;
    setBusy(true); setNotice(null); setError(null);
    try {
      const response = await fetch("/api/admin/trophies", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: selected.status === "disputed" ? "resolve_title_dispute" : teamSize > 1 ? "assign_team_holders" : "assign_holder", trophyId: selected.id,
          userIds: seats.slice(0, teamSize).map(Number), userId: Number(seats[0]), eligibilityOverride: override, reason: assignmentReason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || "Custody assignment failed.");
      setNotice("Custody assignment recorded. Belt chain transfers require separate confirmed proof.");
      await onCustodyChanged(); await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Custody assignment failed."); }
    finally { setBusy(false); }
  }

  const urgent = rows.filter(row => row.phase === "default_grace");
  const validSeats = seats.slice(0, teamSize).every(Boolean) && new Set(seats.slice(0, teamSize)).size === teamSize;
  return (
    <section aria-label="Championship Commissioner cockpit" className="rounded-2xl border border-emerald-200/20 bg-emerald-950/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Shield className="h-5 w-5 text-emerald-200" /><h2 className="font-semibold text-emerald-50">Championship Commissioner</h2></div>
        <button type="button" onClick={() => void load()} disabled={busy} className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Refresh defaults</button>
      </div>
      {urgent.length > 0 ? <p role="status" className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200/45 bg-amber-950/30 p-3 font-bold text-amber-100"><AlertTriangle className="h-5 w-5" />TITLE DEFENSE DEFAULT · {urgent.length} awaiting Commissioner disposition</p> : null}
      {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-950/50 p-3 text-sm text-rose-100">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-emerald-100">{notice}</p> : null}
      <div className="mt-4 space-y-3">
        {rows.map(row => {
          const grace = row.phase === "default_grace";
          const deadline = grace ? row.commissionerGraceDeadline : row.challengeDeadline;
          const seconds = clock.serverNow && deadline ? championshipCountdownSeconds(deadline, clock.serverNow, elapsed) : null;
          return <article key={row.id} className={`rounded-xl border p-4 ${grace ? "border-amber-200/45 bg-amber-950/20" : "border-white/10 bg-black/20"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><Link href={`/challenge/${row.id}`} className="font-semibold text-amber-100 hover:underline">{row.titleName || "Championship Challenge"} · #{row.id}</Link><p className="mt-1 text-xs text-slate-300">{row.nextInstruction || row.phase}</p></div>
              {!row.defenseStartedAt && grace ? <time dateTime={deadline} className="text-2xl font-bold tabular-nums text-amber-100">{seconds === null ? "—" : timer(seconds)}</time> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">{row.participants.map(participant => <span key={`${participant.side}:${participant.seat}`} className="rounded-lg bg-white/5 px-2 py-1 text-slate-300">{participant.name} · {participant.side} · {participant.accepted ? "accepted" : "response required"} · {participant.funded ? "funding verified" : "funding required"} · {participant.notified ? "card delivered" : "delivery unproven"}</span>)}</div>
            <p className="mt-2 text-[11px] text-slate-400">State: {row.phase} · reason: {row.reasonCode || "none"} · start: {row.defenseStartedAt || "unproven"}</p>
            <label className="mt-3 block text-xs text-slate-400">Immutable disposition reason<input className={`${fieldClass} mt-1`} maxLength={1000} value={reasons[row.id] || ""} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))} /></label>
            <div className="mt-3 flex flex-wrap gap-2">{ACTIONS.map(({ action, label }) => <button key={action} type="button" disabled={busy || !reasons[row.id]?.trim()} onClick={() => void act(row, action)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-slate-200 hover:border-emerald-200/40 disabled:opacity-40">{label}</button>)}<label className="flex items-center gap-2 text-xs text-slate-400">Extension hours<input type="number" min={1} max={168} value={extensionHours} onChange={event => setExtensionHours(event.target.value)} className="w-16 rounded-lg border border-white/15 bg-black/30 p-2 text-white" /></label></div>
          </article>;
        })}
        {rows.length === 0 && !error ? <p className="text-xs text-slate-400">No championship defaults or reviews require attention.</p> : null}
      </div>
      {disputes.length > 0 ? <div className="mt-4 space-y-3">{disputes.map(dispute => <article key={dispute.id} className="rounded-xl border border-rose-200/25 bg-rose-950/20 p-4">
        <p className="font-semibold text-rose-100">{dispute.titleName} · disputed custody · no contender is champion</p>
        <p className="mt-1 text-xs text-slate-400">Sealed epoch: {dispute.custodyEpoch} · frozen bounty: {dispute.frozenBountyWolo ?? "unavailable"} WOLO</p>
        <div className="mt-2 space-y-2">{dispute.contenderSnapshot.filter(contender => contender && Array.isArray(contender.roster)).map(contender => <div key={contender.challengeId} className="rounded-lg bg-black/20 p-2 text-xs text-slate-300">
          <Link href={`/challenge/${contender.challengeId}`} className="font-semibold text-amber-100 hover:underline">Contender Challenge #{contender.challengeId}</Link>
          <p className="mt-1">{contender.roster.map(member => `${users.find(user => user.id === member.userId)?.name || `Warrior #${member.userId}`} · seat ${member.seat + 1} · Steam ${member.steamId}`).join(" / ")}</p>
        </div>)}</div>
        <button type="button" className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200" onClick={() => { setTrophyId(String(dispute.trophyId)); setSeats(["", "", "", ""]); setAssignmentReason(""); }}>Prepare exact roster resolution below</button>
      </article>)}</div> : null}
      <details className="mt-5 border-t border-white/10 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-emerald-100"><Crown className="mr-2 inline h-4 w-4" />Assign championship custody / resolve a disputed roster</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Title<select className={`${fieldClass} mt-1`} value={trophyId} onChange={event => { setTrophyId(event.target.value); setSeats(["", "", "", ""]); }}><option value="">Choose championship</option>{trophies.filter(trophy => trophy.kind !== "artifact").map(trophy => <option key={trophy.id} value={trophy.id}>{trophy.displayName} · {trophy.status}</option>)}</select></label>
          {Array.from({ length: teamSize }, (_, seat) => <label key={seat} className="text-xs text-slate-400">Champion seat {seat + 1}<select className={`${fieldClass} mt-1`} value={seats[seat]} onChange={event => setSeats(current => current.map((value, index) => index === seat ? event.target.value : value))}><option value="">Choose warrior</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.representedCountry || "no country"}</option>)}</select></label>)}
        </div>
        <label className="mt-3 block text-xs text-slate-400">Assignment / resolution reason<textarea className={`${fieldClass} mt-1`} maxLength={1000} value={assignmentReason} onChange={event => setAssignmentReason(event.target.value)} /></label>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={override} onChange={event => setOverride(event.target.checked)} />Explicitly bypass holder eligibility; ordinary challengers still require eligibility</label>
        <button type="button" disabled={busy || !selected || !validSeats || !assignmentReason.trim()} onClick={() => void assign()} className="mt-3 rounded-xl border border-emerald-200/30 bg-emerald-900/60 px-4 py-2 text-sm font-semibold text-emerald-50 disabled:opacity-40">Record {teamSize > 1 ? "entire roster" : "holder"} custody</button>
      </details>
      <details className="mt-4 border-t border-white/10 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-200">Belt transfer groups · {transfers.length} recent · chain executor unavailable</summary>
        <p className="mt-3 text-xs text-slate-400">App custody and chain ownership have separate proof. Confirmed seats are never resent; every seat must have verified chain proof before a team transfer completes.</p>
        {transferError ? <p role="alert" className="mt-3 text-sm text-rose-100">{transferError}</p> : null}
        <div className="mt-3 space-y-3">{transfers.map(group => <article key={group.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="font-semibold text-amber-100">{group.titleName} · group #{group.id}</p>
          <p className="mt-1 text-xs text-slate-300">App: {group.appStatus} · NFT: {group.nftStatus} · {group.reasonCode || "no blocker"} · frozen bounty {group.frozenBountyWolo} WOLO{group.bountyPayoutId ? ` · payout #${group.bountyPayoutId}` : ""}</p>
          <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{group.requestKey}</p>
          <div className="mt-2 space-y-2">{group.seats.map(seat => <div key={seat.seat} className="rounded-lg bg-white/5 p-2 text-xs text-slate-400">
            <p className="font-semibold text-slate-200">Seat {seat.seat + 1} · {seat.status} · {seat.errorCode || "no failure"}</p>
            <p className="mt-1 break-all">Class: {seat.nftClassId || "unconfigured"} · token: {seat.nftId}</p>
            <p className="mt-1 break-all">Expected owner: {seat.expectedOwnerAddress || "unproven"} → {seat.recipientAddress || "wallet required"}</p>
            <p className="mt-1 break-all">Chain tx: {seat.txHash || "none — ownership unproven"}</p>
          </div>)}</div>
        </article>)}</div>
      </details>
    </section>
  );
}
