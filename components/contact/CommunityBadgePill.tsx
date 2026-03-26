"use client";

import { badgeToneClassName } from "@/lib/communityHonors";

export default function CommunityBadgePill({ label }: { label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeToneClassName(label)}`}
    >
      {label}
    </span>
  );
}
