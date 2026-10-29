"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Compass, Search, ShieldCheck, Sparkles } from "lucide-react";
import { ADMIN_ATLAS_ROUTES, ATLAS_CLUSTERS, PENDING_NAVIGATION, NAVIGATION_ATLAS_HREF, type AtlasCluster } from "@/lib/navigationAtlas";

const ALL = "all" as const;
type Filter = AtlasCluster | typeof ALL;
const stars = [
  [10,15],[18,48],[36,18],[54,37],[68,12],[83,28],[94,72],
  [15,80],[31,62],[47,82],[65,66],[82,88],
] as const;

export default function AdminNavigationAtlas() {
  const [query, setQuery] = useState("");
  const [cluster, setCluster] = useState<Filter>(ALL);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return ADMIN_ATLAS_ROUTES.filter(route =>
      (cluster === ALL || route.cluster === cluster) &&
      (!term || [route.href, route.label, route.detail, route.cluster]
        .some(piece => piece.toLocaleLowerCase().includes(term)))
    );
  }, [cluster, query]);

  return (
    <section id="navigation-atlas" aria-labelledby="navigation-atlas-heading"
      className="relative isolate scroll-mt-24 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-[#050d1c] px-4 py-7 text-slate-100 shadow-[0_24px_90px_rgba(0,0,0,.45)] sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(34,211,238,.12),transparent_40%),radial-gradient(ellipse_at_85%_20%,rgba(168,85,247,.12),transparent_38%),linear-gradient(125deg,rgba(15,23,42,.7),transparent)]" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.3em] text-cyan-300"><Compass size={15}/> Private Kingdom Navigation</p>
            <h2 id="navigation-atlas-heading" className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Navigation <span className="text-cyan-200">Atlas</span></h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Every authorized admin chamber on one constellation. Find the route, follow the edge, return to command. The graph records source presence only—not deployment, live health or custody approval.</p>
          </div>
          <Link href="/admin/user-list" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-300/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200">
            <ArrowLeft size={15}/> Command Tower
          </Link>
        </div>
        <div aria-hidden="true" className="relative mt-7 hidden h-32 overflow-hidden rounded-2xl border border-cyan-100/10 bg-[radial-gradient(ellipse_at_center,rgba(30,64,175,.15),transparent_70%)] sm:block">
          <svg viewBox="0 0 1000 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <g stroke="#67e8f9" strokeWidth="1" strokeOpacity=".24" fill="none">
              <path d="M100 50 L360 35 L540 100 L830 45 M180 100 L470 145 L680 36 L940 140 M150 145 L540 100 L820 160" />
              <path strokeDasharray="4 10" d="M100 50 L180 100 L360 35 L470 145 L680 36 L820 160 L940 140"/>
            </g>
            {stars.map(([x,y],i) => <circle key={i} cx={x*10} cy={y*1.8} r={i%3===0?5:3} fill={i%2?"#c4b5fd":"#67e8f9"} fillOpacity=".78"/>)}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center gap-3 text-xs font-bold tracking-[.2em] text-cyan-100/80">
            <Sparkles size={18}/> {ADMIN_ATLAS_ROUTES.length} AUTHENTICATED ROUTE NODES · 6 DISTRICTS
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full lg:max-w-md">
            <label htmlFor="navigation-atlas-search" className="mb-2 block text-xs font-semibold tracking-wide text-slate-200">Find a chamber</label>
            <div className="relative"><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-slate-400"/>
              <input id="navigation-atlas-search" type="search" value={query} onChange={e=>setQuery(e.target.value)}
                placeholder="Search people, jobs, storage, releases…" autoComplete="off"
                className="w-full rounded-xl border border-cyan-200/20 bg-slate-950/85 py-3 pl-10 pr-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"/>
            </div>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-slate-300">{visible.length} of {ADMIN_ATLAS_ROUTES.length} source routes · LIVE STATUS UNVERIFIED</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Atlas districts">
          {[{id:ALL,label:"All chambers"},...ATLAS_CLUSTERS.map(({id,label})=>({id,label}))].map(entry=>(
            <button key={entry.id} type="button" aria-pressed={cluster===entry.id} onClick={()=>setCluster(entry.id as Filter)}
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 ${cluster===entry.id?"border-cyan-300/70 bg-cyan-300/20 text-cyan-100":"border-slate-700 bg-slate-950/60 text-slate-300 hover:border-cyan-300/30"}`}>
              {entry.label}
            </button>
          ))}
        </div>
        <nav aria-label="Authenticated admin route constellation" className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((route,i)=>(
            <Link key={route.href} href={route.href} data-atlas-href={route.href}
              className="group relative flex min-h-32 flex-col rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,.92),rgba(3,7,18,.85))] p-4 transition-colors hover:border-cyan-300/45 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200">
              <span className="flex items-center justify-between gap-3 text-[10px] font-mono text-cyan-200/75"><span>NODE {String(i+1).padStart(2,"0")}</span><ArrowUpRight aria-hidden="true" size={15}/></span>
              <span className="mt-3 text-base font-bold text-white group-hover:text-cyan-100">{route.label}</span>
              <span className="mt-1 text-xs leading-5 text-slate-400">{route.detail}</span>
              <span className="mt-auto pt-3 font-mono text-[10px] text-slate-500">{route.href}</span>
            </Link>
          ))}
        </nav>
        {!visible.length && <p role="status" className="mt-6 rounded-2xl border border-dashed border-white/20 p-5 text-sm text-slate-300">No authorized route matches. Clear the search or select another district.</p>}
        <div className="mt-6 grid gap-4 border-t border-white/10 pt-5 lg:grid-cols-[1fr_auto]">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200"><ShieldCheck size={15}/> Not yet source-integrated</h3>
            <p className="mt-2 text-xs text-slate-400">{PENDING_NAVIGATION.map(item=>item.label).join(" · ")}. No clickable route is fabricated until G’s approved pages exist.</p>
            <p className="mt-2 text-xs text-slate-500">Authorization: server-enforced admin layout. Data source: committed route allowlist. Production BUILD_ID: unverified.</p>
          </div>
          <Link href="/admin" className="self-center rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/40">Back to Admin Home</Link>
        </div>
        <span className="sr-only">Navigation Atlas link target: {NAVIGATION_ATLAS_HREF}</span>
      </div>
    </section>
  );
}
