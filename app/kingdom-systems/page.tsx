import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Archive, ArrowUpRight, ClipboardCheck, Cpu, HardDrive, Radio } from "lucide-react";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Kingdom Systems · AoE2WAR",
  description: "The running machine rack, operating-system instruments and evidence-bound storage intelligence.",
  alternates: { canonical: "/kingdom-systems" },
};

const systemTools = [
  { href: "/kingdom-sensors", label: "Kingdom Sensors", detail: "Source-backed observation signals", icon: Radio },
  { href: "/kingdom-tests", label: "Kingdom Tests", detail: "Certification, tests and criteria", icon: ClipboardCheck },
  { href: "/kingdom-recovery", label: "Kingdom Recovery", detail: "Protected restore and rollback evidence", icon: Archive },
  { href: "/aoe2war-os/storage-atlas", label: "Storage Atlas", detail: "Mac, HEL1 root and evidence-volume capacity", icon: HardDrive },
  { href: "/aoe2war-os", label: "AoE2WAR OS", detail: "The unified engineering machine", icon: Cpu },
];

export default function KingdomSystemsPage() {
  return (
    <>
      <nav aria-label="Kingdom Systems instruments" className="border-b border-white/10 bg-[#07101b] px-4 py-8 text-white sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-cyan-200/80">
            <Activity className="h-4 w-4" /> The Kingdom's operating systems
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Kingdom Systems</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            One gateway for the Kingdom's tests, sensors, recovery and storage intelligence.
            These instruments remain reachable without crowding the castle menu.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {systemTools.map(({ href, label, detail, icon: Icon }) => (
              <Link key={href} href={href} className="group flex min-h-36 flex-col justify-between rounded-2xl border border-cyan-100/10 bg-white/[.035] p-4 transition hover:border-cyan-200/35 hover:bg-cyan-200/[.07]">
                <div className="flex justify-between gap-2"><Icon className="h-5 w-5 text-cyan-200" /><ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:text-white" /></div>
                <div><div className="text-sm font-semibold">{label}</div><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></div>
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <KingdomInstruments kind="systems" />
    </>
  );
}
