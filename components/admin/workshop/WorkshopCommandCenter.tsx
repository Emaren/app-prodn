"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Anvil, Eye, Flame, ImagePlus, Radio, RefreshCw, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";

type WorkshopStatus = {
  id: number;
  isOpen: boolean;
  isLive: boolean;
  activityMode: string;
  headline: string;
  description: string;
  currentProject: string | null;
  activeStreamId: number | null;
  updatedAt: string;
};

type WorkshopEntry = {
  id: number;
  publicId: string;
  entryType: string;
  title: string;
  summary: string;
  body: string;
  dialogue: unknown;
  lane: string;
  status: string;
  visibility: string;
  mediaKind: string | null;
  mediaUrl: string | null;
  mediaAlt: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  pinned: boolean;
  featuredOrder: number;
  occurredAt: string;
  publishedAt: string | null;
  updatedAt: string;
};

type WorkshopStream = {
  id: number;
  publicId: string;
  provider: string;
  sourceType: string;
  title: string;
  description: string;
  playbackUrl: string | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
  isPublic: boolean;
  startedAt: string | null;
  endedAt: string | null;
  updatedAt: string;
};

type Snapshot = { status: WorkshopStatus | null; entries: WorkshopEntry[]; streams: WorkshopStream[] };

const MODES = [
  ["quiet_work", "Quiet Work"],
  ["building_live", "Building Live"],
  ["streaming", "Streaming"],
  ["ai_session_live", "AI Session Live"],
  ["major_deployment", "Major Deployment"],
  ["maintenance", "Maintenance"],
  ["special_event", "Special Event"],
] as const;

const ENTRY_TYPES = ["build_note", "ai_discussion", "design_decision", "screenshot", "image", "deployment", "parser_discovery", "video", "livestream", "audio", "milestone"];
const LANES = ["work_feed", "on_anvil", "next_forge", "fresh_forge", "legendary"];

const EMPTY_ENTRY = {
  entryType: "build_note",
  title: "",
  summary: "",
  body: "",
  lane: "work_feed",
  mediaKind: "",
  mediaUrl: "",
  mediaAlt: "",
  linkLabel: "",
  linkUrl: "",
  pinned: false,
  featuredOrder: 0,
  publishNow: false,
  firstSpeaker: "EMAREN",
  firstBody: "",
  secondSpeaker: "THE AI SCRIBE",
  secondBody: "",
};

const EMPTY_STREAM = {
  provider: "first_party",
  sourceType: "external",
  title: "",
  description: "",
  playbackUrl: "",
  embedUrl: "",
  thumbnailUrl: "",
  status: "ready",
  isPublic: false,
};

export default function WorkshopCommandCenter() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [entry, setEntry] = useState(EMPTY_ENTRY);
  const [stream, setStream] = useState(EMPTY_STREAM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const response = await fetch("/api/admin/workshop", { cache: "no-store" });
    const payload = (await response.json()) as Snapshot & { detail?: string };
    if (!response.ok) throw new Error(payload.detail || "Could not load the Workshop command center.");
    setData(payload);
  }, []);

  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load Workshop.")); }, [load]);

  async function request(method: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/workshop", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { detail?: string };
      if (!response.ok) throw new Error(payload.detail || "Workshop mutation failed.");
      await load();
      setMessage("Workshop projection updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Workshop mutation failed.");
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function saveStatus(event: FormEvent) {
    event.preventDefault();
    if (!data?.status) return;
    await request("PATCH", { kind: "status", ...data.status });
  }

  async function createEntry(event: FormEvent) {
    event.preventDefault();
    const dialogue = entry.entryType === "ai_discussion"
      ? [
          { speaker: entry.firstSpeaker, body: entry.firstBody },
          { speaker: entry.secondSpeaker, body: entry.secondBody },
        ].filter((turn) => turn.speaker.trim() && turn.body.trim())
      : [];
    await request("POST", {
      kind: "entry",
      ...entry,
      dialogue,
      status: entry.publishNow ? "published" : "draft",
      visibility: entry.publishNow ? "public" : "private",
      occurredAt: new Date().toISOString(),
    });
    setEntry(EMPTY_ENTRY);
  }

  async function uploadMedia(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      const kind = file.type.startsWith("video/") ? "motion" : "other";
      form.set("file", file);
      form.set("kind", kind);
      form.set("target", `workshop-${Date.now()}`);
      form.set("label", entry.title || "Workshop media");
      form.set("alt", entry.mediaAlt || entry.title || "Workshop build artifact");
      const response = await fetch("/api/admin/media-assets", { method: "POST", body: form });
      const payload = (await response.json()) as { asset?: { url?: string }; detail?: string };
      if (!response.ok || !payload.asset?.url) throw new Error(payload.detail || "Media upload failed.");
      setEntry((current) => ({ ...current, mediaUrl: payload.asset?.url || "", mediaKind: file.type.startsWith("video/") ? "video" : "image" }));
      setMessage("Media is in the managed armory. Publish the entry when ready.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Media upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function togglePublication(row: WorkshopEntry) {
    const publishing = !(row.status === "published" && row.visibility === "public");
    await request("PATCH", {
      kind: "entry",
      ...row,
      status: publishing ? "published" : "draft",
      visibility: publishing ? "public" : "private",
    });
  }

  async function createStream(event: FormEvent) {
    event.preventDefault();
    await request("POST", { kind: "stream", ...stream });
    setStream(EMPTY_STREAM);
  }

  async function mutateStream(row: WorkshopStream, nextStatus: string) {
    await request("PATCH", {
      kind: "stream",
      ...row,
      status: nextStatus,
      isPublic: nextStatus === "live" ? true : row.isPublic,
    });
  }

  const publicEntries = useMemo(() => data?.entries.filter((row) => row.status === "published" && row.visibility === "public").length ?? 0, [data]);

  if (!data) return <main className="py-8 text-white"><div className="rounded-3xl border border-white/10 bg-slate-950/80 p-8">{error || "Opening the Workshop command center…"}</div></main>;

  return (
    <main className="space-y-7 py-7 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-amber-100/14 bg-[radial-gradient(circle_at_10%_0%,rgba(251,146,60,0.18),transparent_30%),linear-gradient(145deg,#190c08,#06101a_60%)] p-7 sm:p-10">
        <div className="flex flex-wrap items-end justify-between gap-5"><div><div className="text-xs font-bold uppercase tracking-[0.38em] text-amber-100/60">Operator Control Center</div><h1 className="mt-3 font-serif text-5xl sm:text-6xl">The Workshop</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Only deliberately published records cross this boundary. Never paste credentials, raw terminal output, private messages, signer material, or private prompts here.</p></div><div className="flex gap-3"><Link href="/workshop" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-5 text-sm font-semibold"><Eye className="h-4 w-4" /> Preview public</Link><button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-slate-950"><RefreshCw className="h-4 w-4" /> Refresh</button></div></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3"><Metric label="Public entries" value={String(publicEntries)} /><Metric label="Draft/private" value={String(data.entries.length - publicEntries)} /><Metric label="Configured streams" value={String(data.streams.length)} /></div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-100/15 bg-emerald-300/[0.06] px-5 py-3 text-sm text-emerald-100">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-100/15 bg-rose-300/[0.06] px-5 py-3 text-sm text-rose-100">{error}</div> : null}

      {data.status ? <form onSubmit={saveStatus} className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex items-center gap-3"><Flame className="h-5 w-5 text-orange-200" /><div><div className="text-xs font-bold uppercase tracking-[0.28em] text-orange-100/58">Live Signal</div><h2 className="mt-1 text-3xl font-semibold">Set the real Workshop state.</h2></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><Toggle label="Workshop open" checked={data.status.isOpen} onChange={(value) => setData({ ...data, status: { ...data.status!, isOpen: value, isLive: value ? data.status!.isLive : false } })} /><Toggle label="Actively live" checked={data.status.isLive} onChange={(value) => setData({ ...data, status: { ...data.status!, isLive: data.status!.isOpen && value } })} /><Field label="Activity mode"><select value={data.status.activityMode} onChange={(event) => setData({ ...data, status: { ...data.status!, activityMode: event.target.value } })} className={inputClass}>{MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Current project"><input value={data.status.currentProject || ""} onChange={(event) => setData({ ...data, status: { ...data.status!, currentProject: event.target.value } })} className={inputClass} /></Field><Field label="Public headline" wide><input value={data.status.headline} onChange={(event) => setData({ ...data, status: { ...data.status!, headline: event.target.value } })} className={inputClass} maxLength={160} /></Field><Field label="Public description" wide><textarea value={data.status.description} onChange={(event) => setData({ ...data, status: { ...data.status!, description: event.target.value } })} className={`${inputClass} min-h-28 py-3`} maxLength={8000} /></Field></div><button disabled={busy} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-amber-200 px-5 text-sm font-bold text-slate-950 disabled:opacity-50"><Save className="h-4 w-4" /> Save live state</button></form> : null}

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <form onSubmit={createEntry} className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex items-center gap-3"><Anvil className="h-5 w-5 text-amber-200" /><div><div className="text-xs font-bold uppercase tracking-[0.28em] text-amber-100/58">Publish to Workshop</div><h2 className="mt-1 text-3xl font-semibold">Create a curated build record.</h2></div></div><div className="mt-6 grid gap-4 md:grid-cols-2"><Field label="Content type"><select value={entry.entryType} onChange={(event) => setEntry({ ...entry, entryType: event.target.value })} className={inputClass}>{ENTRY_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></Field><Field label="Project lane"><select value={entry.lane} onChange={(event) => setEntry({ ...entry, lane: event.target.value })} className={inputClass}>{LANES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></Field><Field label="Title" wide><input required value={entry.title} onChange={(event) => setEntry({ ...entry, title: event.target.value })} className={inputClass} maxLength={200} /></Field><Field label="Summary" wide><textarea value={entry.summary} onChange={(event) => setEntry({ ...entry, summary: event.target.value })} className={`${inputClass} min-h-20 py-3`} maxLength={500} /></Field><Field label="Public body" wide><textarea value={entry.body} onChange={(event) => setEntry({ ...entry, body: event.target.value })} className={`${inputClass} min-h-36 py-3`} maxLength={30000} /></Field>{entry.entryType === "ai_discussion" ? <><Field label="Speaker one"><input value={entry.firstSpeaker} onChange={(event) => setEntry({ ...entry, firstSpeaker: event.target.value })} className={inputClass} /></Field><Field label="Speaker two"><input value={entry.secondSpeaker} onChange={(event) => setEntry({ ...entry, secondSpeaker: event.target.value })} className={inputClass} /></Field><Field label="First selected excerpt" wide><textarea value={entry.firstBody} onChange={(event) => setEntry({ ...entry, firstBody: event.target.value })} className={`${inputClass} min-h-24 py-3`} /></Field><Field label="Second selected excerpt" wide><textarea value={entry.secondBody} onChange={(event) => setEntry({ ...entry, secondBody: event.target.value })} className={`${inputClass} min-h-24 py-3`} /></Field></> : null}<Field label="Media URL"><input value={entry.mediaUrl} onChange={(event) => setEntry({ ...entry, mediaUrl: event.target.value })} className={inputClass} placeholder="Managed upload or approved HTTPS URL" /></Field><Field label="Media kind"><select value={entry.mediaKind} onChange={(event) => setEntry({ ...entry, mediaKind: event.target.value })} className={inputClass}><option value="">None</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Audio</option></select></Field><Field label="Media alt text" wide><input value={entry.mediaAlt} onChange={(event) => setEntry({ ...entry, mediaAlt: event.target.value })} className={inputClass} /></Field><Field label="Managed media upload" wide><label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-cyan-100/20 bg-cyan-300/[0.035] px-4 text-sm text-cyan-100"><ImagePlus className="h-4 w-4" /> {uploading ? "Uploading…" : "Choose image or MP4/WEBM"}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" disabled={uploading} className="hidden" onChange={(event) => void uploadMedia(event.target.files?.[0] || null)} /></label></Field><Field label="Link label"><input value={entry.linkLabel} onChange={(event) => setEntry({ ...entry, linkLabel: event.target.value })} className={inputClass} /></Field><Field label="Link URL"><input value={entry.linkUrl} onChange={(event) => setEntry({ ...entry, linkUrl: event.target.value })} className={inputClass} /></Field><Field label="Featured order"><input type="number" value={entry.featuredOrder} onChange={(event) => setEntry({ ...entry, featuredOrder: Number(event.target.value) })} className={inputClass} /></Field><div className="grid gap-3"><Toggle label="Pin entry" checked={entry.pinned} onChange={(value) => setEntry({ ...entry, pinned: value })} /><Toggle label="Publish publicly now" checked={entry.publishNow} onChange={(value) => setEntry({ ...entry, publishNow: value })} /></div></div><div className="mt-5 flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-200" /> Draft is the safe default.</div><button disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-200 px-5 text-sm font-bold text-slate-950 disabled:opacity-50"><Sparkles className="h-4 w-4" /> Create entry</button></div></form>

        <div className="space-y-6"><form onSubmit={createStream} className="rounded-[1.8rem] border border-red-100/10 bg-red-300/[0.035] p-6 sm:p-8"><div className="flex items-center gap-3"><Radio className="h-5 w-5 text-red-200" /><div><div className="text-xs font-bold uppercase tracking-[0.28em] text-red-100/58">Stream Foundation</div><h2 className="mt-1 text-2xl font-semibold">Configure an explicit signal.</h2></div></div><p className="mt-4 text-sm leading-6 text-slate-400">This records presentation metadata only. It never captures the desktop or starts broadcasting on its own.</p><div className="mt-5 space-y-4"><Field label="Stream title"><input required value={stream.title} onChange={(event) => setStream({ ...stream, title: event.target.value })} className={inputClass} /></Field><Field label="Description"><textarea value={stream.description} onChange={(event) => setStream({ ...stream, description: event.target.value })} className={`${inputClass} min-h-24 py-3`} /></Field><Field label="Direct playback URL"><input value={stream.playbackUrl} onChange={(event) => setStream({ ...stream, playbackUrl: event.target.value })} className={inputClass} /></Field><Field label="Approved embed URL"><input value={stream.embedUrl} onChange={(event) => setStream({ ...stream, embedUrl: event.target.value })} className={inputClass} /></Field><Field label="Thumbnail URL"><input value={stream.thumbnailUrl} onChange={(event) => setStream({ ...stream, thumbnailUrl: event.target.value })} className={inputClass} /></Field><Toggle label="Publicly visible" checked={stream.isPublic} onChange={(value) => setStream({ ...stream, isPublic: value })} /></div><button disabled={busy} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-red-200 px-5 text-sm font-bold text-red-950 disabled:opacity-50"><Save className="h-4 w-4" /> Save stream</button></form><div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6"><h2 className="text-xl font-semibold">Configured signals</h2><div className="mt-4 space-y-3">{data.streams.length ? data.streams.map((row) => <article key={row.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{row.status} · {row.sourceType}</div><div className="mt-1 font-semibold">{row.title}</div></div>{row.status === "live" ? <span className="animate-pulse rounded-full bg-red-300 px-2 py-1 text-[10px] font-bold text-red-950">LIVE</span> : null}</div><div className="mt-3 flex flex-wrap gap-2">{row.status !== "live" ? <button onClick={() => void mutateStream(row, "live")} className="rounded-full bg-red-200 px-3 py-1.5 text-xs font-bold text-red-950">Go live</button> : <button onClick={() => void mutateStream(row, "ended")} className="rounded-full border border-white/12 px-3 py-1.5 text-xs">End</button>}<button onClick={() => void mutateStream(row, "hidden")} className="rounded-full border border-white/12 px-3 py-1.5 text-xs">Hide</button></div></article>) : <div className="text-sm text-slate-500">No stream configured.</div>}</div></div></div>
      </section>

      <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex items-end justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-100/58">Publication Ledger</div><h2 className="mt-2 text-3xl font-semibold">Published, drafted, and archived work.</h2></div><span className="text-xs text-slate-500">{data.entries.length} records</span></div><div className="mt-6 grid gap-4 lg:grid-cols-2">{data.entries.map((row) => <article key={row.id} className={`rounded-2xl border p-5 ${row.status === "published" && row.visibility === "public" ? "border-emerald-100/14 bg-emerald-300/[0.04]" : "border-white/8 bg-white/[0.025]"}`}><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">#{row.id} · {row.entryType} · {row.lane}</div><h3 className="mt-2 text-xl font-semibold">{row.title}</h3></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${row.status === "published" && row.visibility === "public" ? "bg-emerald-200 text-emerald-950" : "bg-white/8 text-slate-300"}`}>{row.status}/{row.visibility}</span></div><p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">{row.summary || row.body || "No public copy yet."}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void togglePublication(row)} className="rounded-full bg-amber-200 px-3 py-2 text-xs font-bold text-amber-950">{row.status === "published" && row.visibility === "public" ? "Unpublish" : "Publish"}</button><Link href={`/workshop#${row.publicId}`} className="rounded-full border border-white/12 px-3 py-2 text-xs">Open public anchor</Link><button onClick={async () => { if (!window.confirm(`Delete ${row.title}?`)) return; setBusy(true); try { const response = await fetch(`/api/admin/workshop?kind=entry&id=${row.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Delete failed."); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Delete failed."); } finally { setBusy(false); } }} className="ml-auto inline-flex items-center gap-1 rounded-full border border-rose-100/12 px-3 py-2 text-xs text-rose-100"><Trash2 className="h-3.5 w-3.5" /> Delete</button></div></article>)}</div></section>
    </main>
  );
}

const inputClass = "min-h-12 w-full rounded-2xl border border-white/10 bg-black/24 px-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-100/30";
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/9 bg-black/22 p-4"><div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div>; }
function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) { return <label className={`block ${wide ? "md:col-span-2" : ""}`}><span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-white/9 bg-white/[0.025] px-4 text-sm text-slate-200"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-amber-300" /></label>; }
