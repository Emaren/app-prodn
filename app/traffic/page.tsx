"use client";

import { useEffect, useState } from "react";

import PremiumTimeSeriesChart, {
  type ObservatoryPoint,
  type ObservatorySeries,
} from "@/components/observatory/PremiumTimeSeriesChart";

const SERIES: ObservatorySeries[] = [
  {
    key: "totalTraffic",
    label: "Total Traffic",
    color: "#f5c65b",
    axis: "count",
    defaultVisible: true,
  },
  {
    key: "suspectedHuman",
    label: "Suspected Human",
    color: "#5aa9ff",
    axis: "count",
    defaultVisible: true,
  },
  {
    key: "confirmedHuman",
    label: "Confirmed Human",
    color: "#42f1b5",
    axis: "count",
    defaultVisible: true,
  },
];

export default function TrafficPage() {
  const [points, setPoints] = useState<ObservatoryPoint[]>([]);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/traffic/public", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Traffic unavailable");
        }

        return response.json();
      })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setPoints(Array.isArray(payload.points) ? payload.points : []);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative left-1/2 min-h-screen w-screen -translate-x-1/2 overflow-hidden bg-[#02070d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.12),transparent_27%),radial-gradient(circle_at_82%_0%,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(245,158,11,0.07),transparent_38%)]" />

      <div className="relative mx-auto max-w-[1900px] px-3 py-5 sm:px-5 lg:px-8">
        {points.length ? (
          <PremiumTimeSeriesChart
            title="Traffic"
            points={points}
            series={SERIES}
            variant="traffic"
          />
        ) : (
          <div className="min-h-[80vh] animate-pulse rounded-[2.5rem] border border-white/[0.06] bg-white/[0.025]" />
        )}

        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
            Unavailable
          </div>
        ) : null}
      </div>
    </main>
  );
}
