"use client";

import * as React from "react";

function formatUtc(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function formatLocal(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatMountain(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
    timeZoneName: "shortGeneric",
  }).format(date);
}

export function WarGraphTime({
  value,
  className,
  clock = "local",
}: {
  value: string;
  className?: string;
  clock?: "local" | "mountain";
}) {
  const [label, setLabel] = React.useState(() =>
    clock === "mountain" ? formatMountain(value) : formatUtc(value),
  );

  React.useEffect(() => {
    setLabel(clock === "mountain" ? formatMountain(value) : formatLocal(value));
  }, [clock, value]);

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}
