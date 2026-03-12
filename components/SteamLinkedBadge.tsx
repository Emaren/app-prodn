import type { SVGProps } from "react";

type SteamLinkedBadgeProps = {
  label?: string;
  compact?: boolean;
  className?: string;
};

export default function SteamLinkedBadge({
  label = "Steam linked",
  compact = false,
  className = "",
}: SteamLinkedBadgeProps) {
  const padding = compact ? "px-2.5 py-1" : "px-3 py-1.5";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const textSize = compact ? "text-[11px]" : "text-xs";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border border-[#66c0f4]/25 bg-[#1b2838]/85 font-medium text-[#c7d5e0]",
        padding,
        textSize,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <SteamGlyph className={iconSize} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

function SteamGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <path
        d="M9 14L14.2 10.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8.3" cy="14.4" r="2.35" fill="currentColor" />
      <circle cx="8.3" cy="14.4" r="0.95" fill="#0f172a" />
      <circle cx="16.9" cy="9.2" r="2.75" fill="currentColor" />
      <circle cx="16.9" cy="9.2" r="1.25" fill="#0f172a" />
    </svg>
  );
}

export function SteamGlyphOnly(props: SVGProps<SVGSVGElement>) {
  return <SteamGlyph className={props.className} />;
}
