"use client";

type StatCardProps = {
  label: string;
  value: string;
  subtext?: string;
  valueClassName?: string;
  tone?: "default" | "amber" | "emerald";
};

export function StatCard({
  label,
  value,
  subtext,
  valueClassName,
  tone = "default",
}: StatCardProps) {
  const toneClasses =
    tone === "amber"
      ? {
          card: "border-amber-300/15 bg-amber-300/5",
          label: "text-amber-100/75",
        }
      : tone === "emerald"
        ? {
            card: "border-emerald-400/15 bg-emerald-500/5",
            label: "text-emerald-100/75",
          }
        : {
            card: "border-white/10 bg-white/5",
            label: "text-slate-400",
          };

  return (
    <div className={`min-h-[118px] rounded-[1.4rem] border px-5 py-5 ${toneClasses.card}`}>
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="space-y-3">
          <div className={`text-[11px] uppercase tracking-[0.32em] ${toneClasses.label}`}>
            {label}
          </div>
          <div
            className={[
              "text-4xl font-semibold leading-none tracking-tight text-white tabular-nums",
              valueClassName,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {value}
          </div>
        </div>
        <div className="min-h-[1.5rem] text-xs leading-5 text-slate-400">
          {subtext || "\u00a0"}
        </div>
      </div>
    </div>
  );
}
