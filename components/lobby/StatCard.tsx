"use client";

type StatCardProps = {
  label: string;
  value: string;
};

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-5 py-5 min-h-[118px]">
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">{label}</div>
          <div className="text-4xl font-semibold leading-none tracking-tight text-white tabular-nums">
            {value}
          </div>
        </div>
        <div className="min-h-[1rem] text-xs text-slate-400">&nbsp;</div>
      </div>
    </div>
  );
}
