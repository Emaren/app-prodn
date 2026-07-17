"use client";

import { useEffect, useState } from "react";

import PremiumTimeSeriesChart, {
  type ObservatoryPoint,
  type ObservatorySeries,
} from "@/components/observatory/PremiumTimeSeriesChart";

const SERIES: ObservatorySeries[] = [
  {
    key: "woloTransferred",
    label: "WOLO Transferred",
    color: "#f5c15d",
    axis: "wolo",
    defaultVisible: true,
  },
  {
    key: "newUsers",
    label: "New Users",
    color: "#60a5fa",
    axis: "count",
    defaultVisible: true,
  },
  {
    key: "totalUsers",
    label: "Total Users",
    color: "#818cf8",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "returningUsers",
    label: "Returning Users / Day",
    color: "#34d399",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "usersWhoReturned",
    label: "Users Who Returned",
    color: "#10b981",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "betsPlaced",
    label: "Bets Placed",
    color: "#fb7185",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "betVolumeWolo",
    label: "Bet Volume",
    color: "#c084fc",
    axis: "wolo",
    defaultVisible: false,
  },
  {
    key: "gamesStreamed",
    label: "Games Streamed",
    color: "#22d3ee",
    axis: "count",
    defaultVisible: true,
  },
  {
    key: "watcherGamesIngested",
    label: "Watcher Games",
    color: "#38bdf8",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "streamedPlayerSeats",
    label: "Players Streamed",
    color: "#f97316",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "watcherFirstLaunches",
    label: "First Watcher Launches",
    color: "#e879f9",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "activeWatchers",
    label: "Active Watchers",
    color: "#a3e635",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "marketplaceRequests",
    label: "Marketplace Requests",
    color: "#facc15",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "proposedShops",
    label: "Proposed Shops",
    color: "#fb923c",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "featureRequests",
    label: "Workshop Requests",
    color: "#2dd4bf",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "bountyClaims",
    label: "Bounty Claims",
    color: "#f59e0b",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "forumPosts",
    label: "Forum Posts",
    color: "#818cf8",
    axis: "count",
    defaultVisible: false,
  },
  {
    key: "radioSubmissions",
    label: "Radio Submissions",
    color: "#f472b6",
    axis: "count",
    defaultVisible: false,
  },
];

export default function StatisticsPage() {
  const [points, setPoints] = useState<ObservatoryPoint[]>([]);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/statistics", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Statistics unavailable");
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
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05040d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(245,158,11,0.11),transparent_29%),radial-gradient(circle_at_82%_4%,rgba(139,92,246,0.16),transparent_31%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.08),transparent_38%)]" />

      <div className="relative mx-auto max-w-[1900px] px-3 py-5 sm:px-5 lg:px-8">
        {points.length ? (
          <PremiumTimeSeriesChart
            title="Statistics"
            points={points}
            series={SERIES}
            variant="statistics"
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
