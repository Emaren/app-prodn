"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  trackLeaderboardEvent,
  type LeaderboardDestination,
} from "@/lib/leaderboardTelemetry";

export function LeaderboardViewLink({
  from,
  to,
  href,
  children,
}: {
  from: LeaderboardDestination;
  to: LeaderboardDestination;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() =>
        trackLeaderboardEvent({
          type: "leaderboard_switch_view",
          metadata: { from, to },
        })
      }
      className="inline-flex items-center gap-2 border-b border-amber-200/35 pb-1 text-sm font-semibold text-amber-100 transition hover:border-amber-100 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55"
    >
      {children}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
