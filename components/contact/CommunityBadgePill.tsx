"use client";

import { badgeToneClassName, parseHonorLabel } from "@/lib/communityHonors";

export default function CommunityBadgePill({ label }: { label: string }) {
  const parsed = parseHonorLabel(label);

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeToneClassName(label)}`}
    >
      {parsed.title}
    </span>
  );
}
