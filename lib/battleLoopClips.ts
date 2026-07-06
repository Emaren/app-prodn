export const BATTLE_LOOP_CLIPS = [
  "/watch/previews/live-building-loop.mp4",
  "/watch-loops/live-hero-loop.mp4",
  "/watch/previews/emaren-vs-julio-alvarez.mp4",
  "/watch/previews/emaren-vs-koolamumomu.mp4",
  "/watch-loops/emaren-vs-chronotrigger.mp4",
  "/watch-loops/emaren-vs-sechma.mp4",
  "/watch-loops/emaren-vs-sir-benni-miles.mp4",
  "/watch/previews/emaren-vs-divided.mp4",
] as const;

export function battleLoopForSeed(seed: string | number | null | undefined) {
  const text = String(seed ?? "aoe2war");
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return BATTLE_LOOP_CLIPS[Math.abs(hash) % BATTLE_LOOP_CLIPS.length] ?? BATTLE_LOOP_CLIPS[0];
}
