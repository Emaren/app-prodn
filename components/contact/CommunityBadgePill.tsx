"use client";

import { badgeToneClassName, parseHonorLabel } from "@/lib/communityHonors";

export default function CommunityBadgePill({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
  const parsed = parseHonorLabel(label);

  return (
    <span
      className={`whitespace-nowrap rounded-full border font-medium ${badgeToneClassName(label)} ${
        compact
          ? "shrink-0 px-2.5 py-[2px] text-[10px] leading-[1.05rem]"
          : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {parsed.title}
    </span>
  );
}
