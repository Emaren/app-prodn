"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

function getNextPayoutDate(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(0, 10, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function formatLocalPayoutTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export default function StakingPayoutSchedule() {
  const [nextPayoutLabel, setNextPayoutLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setNextPayoutLabel(formatLocalPayoutTime(getNextPayoutDate()));
    };

    update();

    const interval = window.setInterval(update, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="mt-4 inline-flex max-w-full flex-col gap-1.5 rounded-[1.1rem] border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:flex-row sm:items-center sm:gap-3">
      <span className="inline-flex items-center gap-2 font-semibold text-amber-100">
        <Clock3 className="h-4 w-4" />
        Rewards distribute daily.
      </span>
      <span className="text-slate-400">
        Next payout:{" "}
        <span className="font-semibold text-slate-100">
          {nextPayoutLabel ?? "loading local time"}
        </span>
      </span>
      <span className="text-xs text-slate-500">Shown in your local time.</span>
    </div>
  );
}
