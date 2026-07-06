import { battleLoopForSeed } from "@/lib/battleLoopClips";

type BattleLoopPreviewProps = {
  seed: string | number | null | undefined;
  className?: string;
  label?: string;
};

export function BattleLoopPreview({
  seed,
  className = "",
  label = "AoE2WAR battle loop",
}: BattleLoopPreviewProps) {
  const src = battleLoopForSeed(seed);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-black ${className}`}>
      <video
        key={src}
        src={src}
        className="h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.02),rgba(2,6,23,0.38))]" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/35 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-100">
        Battle loop
      </div>
    </div>
  );
}
