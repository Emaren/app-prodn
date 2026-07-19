"use client";

import { useEffect, useMemo, useState } from "react";

export default function ChallengeTime({
  value,
  fallback = "Play anytime",
  compact = false,
}: {
  value: string | Date | null | undefined;
  fallback?: string;
  compact?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const iso = value instanceof Date ? value.toISOString() : value || null;
  const parsed = useMemo(() => (iso ? new Date(iso) : null), [iso]);
  if (!parsed || Number.isNaN(parsed.getTime())) return <>{fallback}</>;

  const local = mounted
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(parsed)
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(parsed);
  const utc = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(parsed);

  return (
    <span className={compact ? "inline-flex flex-wrap gap-x-1" : "inline-grid gap-0.5"}>
      <span>{local}</span>
      <span className="text-[0.78em] font-medium text-slate-500">UTC {utc}</span>
    </span>
  );
}
