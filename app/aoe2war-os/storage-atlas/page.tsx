import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity, Archive, ArrowUpRight, Clock3, Database, FolderSearch,
  HardDrive, Laptop, LockKeyhole, Server, ShieldCheck, Wrench,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Storage Atlas · AoE2WAR OS",
  description: "Three-drive capacity, retention, evidence coverage and safe-reclamation status.",
  alternates: { canonical: "/aoe2war-os/storage-atlas" },
};

type State = "HOLD" | "PRESSURE" | "OBSERVED_OK";
type Drive = {
  name: string;
  subtitle: string;
  free: string;
  effectiveUsage: string;
  state: State;
  asOf: string;
  receipt: string;
  note: string;
};

const drives: readonly Drive[] = [
  {
    name: "Development Mac",
    subtitle: "Local build and media workstation",
    free: "14.165 GiB",
    effectiveUsage: "Not remeasured after cleanup",
    state: "PRESSURE",
    asOf: "27 OCT 2026",
    receipt: "Owner terminal · APFS Data",
    note: "2.606 GiB was actually reclaimed from two historical generated Next.js builds. Further census coverage remains incomplete.",
  },
  {
    name: "HEL1 Root",
    subtitle: "Live applications and operating system",
    free: "67.04 GiB",
    effectiveUsage: "53.4%",
    state: "OBSERVED_OK",
    asOf: "27 OCT 2026 · 14:02 UTC",
    receipt: "VPSSentry Storage Doctor",
    note: "Healthy at observation. Root is not the evidence-volume bottleneck and does not currently need enlargement.",
  },
  {
    name: "HEL1 Evidence Volume",
    subtitle: "Protected project and chain evidence",
    free: "23.13 GiB",
    effectiveUsage: "91.8%",
    state: "HOLD",
    asOf: "27 OCT 2026 · 14:02 UTC",
    receipt: "VPSSentry Storage Doctor",
    note: "Snapshot admission requires at most 88% effective used capacity. Approximately 10.83 GiB net relief, plus margin, was needed at observation.",
  },
];

const stateCopy: Record<State, { label: string; classes: string }> = {
  HOLD: { label: "ADMISSION HOLD", classes: "border-rose-300/25 bg-rose-400/10 text-rose-200" },
  PRESSURE: { label: "CAPACITY PRESSURE", classes: "border-amber-300/25 bg-amber-400/10 text-amber-200" },
  OBSERVED_OK: { label: "OK AT OBSERVATION", classes: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" },
};

const principles = [
  {
    icon: ShieldCheck,
    title: "Protected first",
    text: "Financial and chain evidence, staged releases, personal archives and original gameplay video are not treated as disposable build output.",
  },
  {
    icon: FolderSearch,
    title: "Prove the junk",
    text: "Before removal: exact source, rebuild recipe, clean ownership, inactive consumers, no protected dependency, and a bounded approved plan.",
  },
  {
    icon: Activity,
    title: "Measure the result",
    text: "Capacity gain comes from before-and-after filesystem receipts, never estimates made from directory sizes alone.",
  },
];

const operations = [
  { href: "/kingdom-systems", title: "Kingdom Systems", detail: "Discover the operating machinery" },
  { href: "/kingdom-sensors", title: "Kingdom Sensors", detail: "Inspect observation and capacity signals" },
  { href: "/kingdom-tests", title: "Kingdom Tests", detail: "Understand source and policy verification" },
  { href: "/kingdom-recovery", title: "Kingdom Recovery", detail: "Inspect restoration and rollback boundaries" },
];

export default function StorageAtlasPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050b15] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(34,211,238,.13),transparent_40%),radial-gradient(ellipse_at_90%_25%,rgba(245,158,11,.09),transparent_40%)]" />
      <div className="relative mx-auto max-w-7xl px-4 pb-28 pt-12 sm:px-8 sm:pt-16">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/75">
          <Link href="/aoe2war-os" className="hover:text-white">AOE2WAR OS</Link>
          <span className="text-slate-500">/</span>
          <span>Storage Atlas</span>
        </div>

        <header className="mt-8 grid gap-8 border-b border-white/10 pb-12 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
              <HardDrive className="h-4 w-4" /> The estate / capacity intelligence
            </div>
            <h1 className="text-5xl font-black tracking-tight text-white sm:text-7xl">STORAGE <span className="text-cyan-200">ATLAS</span></h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Three drives. One retention policy. Every safe cleanup must be explained, admitted and measured.
              No hidden deletion. No fabricated health.
            </p>
          </div>
          <aside className="rounded-3xl border border-amber-200/20 bg-amber-200/[.055] p-6" aria-label="Evidence freshness">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-200">
              <Clock3 className="h-4 w-4" /> Historical evidence
            </div>
            <p className="mt-3 text-2xl font-semibold text-white">Not a live scan</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              These figures come from operator and Storage Doctor receipts on October 27, 2026.
              Live authenticated cross-estate telemetry is not connected. New capacity changes cannot be inferred from this page.
            </p>
          </aside>
        </header>

        <section className="mt-12" aria-labelledby="drive-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.23em] text-cyan-200/70">01 / The storage estate</p>
              <h2 id="drive-heading" className="mt-2 text-2xl font-bold sm:text-3xl">Last evidenced capacity</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-white/[.04] px-4 py-2 text-xs text-slate-300">Census coverage: PARTIAL / UNVERIFIED COMPLETENESS</span>
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {drives.map((drive, i) => {
              const Icon = i === 0 ? Laptop : i === 1 ? Server : Database;
              const state = stateCopy[drive.state];
              return (
                <article key={drive.name} className="flex min-h-[355px] flex-col rounded-[1.75rem] border border-white/10 bg-[linear-gradient(160deg,#102338,#091321)] p-6 shadow-2xl shadow-black/10">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-2xl border border-white/10 bg-white/[.05] p-3 text-cyan-200"><Icon className="h-6 w-6" /></span>
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-wide ${state.classes}`}>{state.label}</span>
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-white">{drive.name}</h3>
                  <p className="mt-1 text-sm text-slate-400">{drive.subtitle}</p>
                  <div className="mt-7 flex items-end justify-between gap-4 border-t border-white/10 pt-5">
                    <div><div className="text-[10px] uppercase tracking-widest text-slate-400">Available at observation</div><div className="mt-1 text-3xl font-bold tabular-nums text-white">{drive.free}</div></div>
                    <div className="text-right"><div className="text-[10px] uppercase tracking-widest text-slate-400">Effective used</div><div className="mt-1 text-sm font-semibold text-slate-200">{drive.effectiveUsage}</div></div>
                  </div>
                  <p className="mt-5 flex-1 text-sm leading-6 text-slate-300">{drive.note}</p>
                  <div className="mt-5 border-t border-white/10 pt-4 text-[11px] text-slate-400"><span className="font-semibold text-slate-300">{drive.asOf}</span><span className="mx-2">·</span>{drive.receipt}</div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-14 grid gap-6 lg:grid-cols-[.75fr_1.25fr]" aria-labelledby="reclaim-heading">
          <article className="rounded-[1.75rem] border border-emerald-200/15 bg-emerald-300/[.055] p-7">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-emerald-200">02 / Measured reclamation</p>
            <h2 id="reclaim-heading" className="mt-4 text-5xl font-black tabular-nums">+2.606 <span className="text-lg font-semibold">GiB</span></h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">Verified APFS gain after two guarded historical Next.js build removals. Zero parent worktrees removed. No financial or creative source deleted.</p>
          </article>
          <article className="rounded-[1.75rem] border border-white/10 bg-white/[.025] p-7">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200/80">03 / Safety laws</p>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              {principles.map(({ icon: Icon, title, text }) => (
                <div key={title}>
                  <Icon className="h-6 w-6 text-cyan-200" />
                  <h3 className="mt-4 font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-xs leading-6 text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-14" aria-labelledby="operating-heading">
          <p className="text-xs font-semibold uppercase tracking-[.23em] text-cyan-200/70">04 / Connected Kingdom instruments</p>
          <h2 id="operating-heading" className="mt-2 text-2xl font-bold">Explore the machinery</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {operations.map((item) => (
              <Link href={item.href} key={item.href} className="group flex min-h-36 flex-col justify-between rounded-2xl border border-white/10 bg-white/[.035] p-5 transition hover:border-cyan-200/30 hover:bg-cyan-200/[.07]">
                <div className="flex items-start justify-between gap-2"><Wrench className="h-5 w-5 text-cyan-200" /><ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:text-white" /></div>
                <div><h3 className="font-semibold text-white">{item.title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{item.detail}</p></div>
              </Link>
            ))}
          </div>
        </section>

        <footer className="mt-14 rounded-2xl border border-white/10 bg-white/[.025] p-6 text-sm leading-6 text-slate-400">
          <div className="flex items-center gap-2 font-semibold text-white"><LockKeyhole className="h-5 w-5 text-cyan-200" /> Read-only by design</div>
          <p className="mt-2">No private file paths, backups, keys, host commands or cleanup controls are published here. This snapshot neither scans a device nor certifies production. Authenticated collectors, private operator drilldowns and continuous telemetry require separate admission.</p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/aoe2war-os" className="text-cyan-200 hover:text-white">Back to AoE2WAR OS</Link>
            <Link href="/kingdom-systems" className="text-cyan-200 hover:text-white">Kingdom Systems</Link>
            <a href="https://github.com/Emaren/app-prodn/issues/934" className="text-cyan-200 hover:text-white" rel="noopener noreferrer" target="_blank">Source evidence <ArrowUpRight className="inline h-3 w-3" /></a>
          </div>
        </footer>
      </div>
    </main>
  );
}
