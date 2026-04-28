"use client";

import React from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

type ConnectionStatus = "online" | "offline" | "stale";

export function useConnectionStatus(lastUpdatedAt?: string | null, staleMs = 120_000) {
  const [isOnline, setIsOnline] = React.useState(true);
  const [now, setNow] = React.useState(0);

  React.useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);

    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    setNow(Date.now());

    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.clearInterval(interval);
    };
  }, []);

  const updatedAtMs = lastUpdatedAt ? Date.parse(lastUpdatedAt) : NaN;
  const isStale = Number.isFinite(updatedAtMs) && now > 0 && now - updatedAtMs > staleMs;

  if (!isOnline) return "offline" as const;
  if (isStale) return "stale" as const;
  return "online" as const;
}

export default function ConnectionStatusRail({
  lastUpdatedAt,
  className = "",
}: {
  lastUpdatedAt?: string | null;
  className?: string;
}) {
  const status = useConnectionStatus(lastUpdatedAt);
  const config: Record<
    ConnectionStatus,
    { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
  > = {
    online: {
      label: "Online",
      className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
      icon: Cloud,
    },
    stale: {
      label: "Stale data",
      className: "border-amber-300/25 bg-amber-400/10 text-amber-100",
      icon: RefreshCw,
    },
    offline: {
      label: "Offline · showing last known data",
      className: "border-slate-300/20 bg-slate-300/10 text-slate-100",
      icon: CloudOff,
    },
  };

  const Icon = config[status].icon;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${config[status].className} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{config[status].label}</span>
    </div>
  );
}
