import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Radio WOLO",
  description: "The music, artists, and cultural broadcast wing of AoE2WAR.",
};

export default async function RadioPage() {
  const tracks = await getPrisma().radioSubmission.findMany({
    where: { status: "published" },
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
    take: 60,
    select: {
      publicId: true,
      artistName: true,
      trackTitle: true,
      genre: true,
      featured: true,
      publishedAt: true,
      artworkStorageKey: true,
    },
  });
  const nowPlaying = tracks[0] || null;

  return <main className="space-y-7 py-7 text-white">
    <section className="overflow-hidden rounded-[2.2rem] border border-fuchsia-100/12 bg-[radial-gradient(circle_at_14%_0%,rgba(232,121,249,0.2),transparent_32%),radial-gradient(circle_at_86%_18%,rgba(34,211,238,0.13),transparent_28%),linear-gradient(145deg,#14081a,#050811_62%)] p-7 sm:p-11">
      <div className="text-xs font-bold uppercase tracking-[0.42em] text-fuchsia-100/65">Radio WOLO</div>
      <h1 className="mt-4 max-w-4xl font-serif text-5xl leading-none sm:text-7xl">The kingdom has a soundtrack.</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Community music, Wolomania energy, battle-night rotations, and artists of the surviving HD kingdom.</p>
      <Link href="/submit" className="mt-7 inline-flex rounded-full bg-fuchsia-200 px-6 py-3 text-sm font-bold text-slate-950">Submit Your Music</Link>
    </section>

    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-slate-950/75">
        <div className="grid h-full md:grid-cols-[15rem_1fr]">
          <div className="relative min-h-56 bg-[radial-gradient(circle_at_35%_20%,rgba(232,121,249,0.28),transparent_36%),linear-gradient(145deg,#160a1c,#07111f)]">
            {nowPlaying?.artworkStorageKey ? <Image src={`/api/radio/tracks/${nowPlaying.publicId}/artwork`} alt={`${nowPlaying.trackTitle} cover artwork`} fill unoptimized className="object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-6xl text-fuchsia-100/45">◉</div>}
          </div>
          <div className="p-6 sm:p-8">
            <div className="text-xs uppercase tracking-[0.3em] text-cyan-100/55">Now Playing</div>
            {nowPlaying ? <><h2 className="mt-3 text-4xl font-semibold">{nowPlaying.trackTitle}</h2><div className="mt-2 text-lg text-fuchsia-100">{nowPlaying.artistName}</div>{nowPlaying.genre ? <div className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{nowPlaying.genre}</div> : null}<audio className="mt-7 w-full" controls preload="metadata" src={`/api/radio/tracks/${nowPlaying.publicId}/audio`} /></> : <><h2 className="mt-3 text-3xl font-semibold">The transmitter is warming up.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Approved tracks will appear here only after operator publication. No private submission is exposed automatically.</p></>}
          </div>
        </div>
      </div>
      <div className="rounded-[1.8rem] border border-amber-200/12 bg-amber-300/[0.055] p-6 sm:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-100/55">Artists of the Kingdom</div>
        <h2 className="mt-3 text-3xl font-semibold">Bring original work into the rotation.</h2>
        <p className="mt-4 text-sm leading-7 text-slate-300">Radio WOLO is built for community tracks, premieres, event themes, and future station programming. The current rail starts with durable submission, private review, and explicit publication.</p>
        <Link href="/submit" className="mt-6 inline-flex rounded-full border border-amber-100/20 px-5 py-3 text-sm font-semibold text-amber-50">Open creator submission</Link>
      </div>
    </section>

    <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8">
      <div className="text-xs uppercase tracking-[0.3em] text-fuchsia-100/55">The Vault</div><h2 className="mt-2 text-3xl font-semibold">Published rotation</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{tracks.length ? tracks.map((track) => <article key={track.publicId} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"><div className="relative aspect-[16/8] bg-[linear-gradient(145deg,#17091d,#07111f)]">{track.artworkStorageKey ? <Image src={`/api/radio/tracks/${track.publicId}/artwork`} alt={`${track.trackTitle} cover artwork`} fill unoptimized className="object-cover" /> : <div className="absolute inset-0 flex items-center justify-center text-4xl text-fuchsia-100/35">◉</div>}</div><div className="p-5"><div className="text-xs uppercase tracking-[0.2em] text-slate-500">{track.featured ? "Featured broadcast" : track.genre || "Radio vault"}</div><h3 className="mt-3 text-xl font-semibold">{track.trackTitle}</h3><div className="mt-1 text-sm text-fuchsia-100">{track.artistName}</div><audio className="mt-4 w-full" controls preload="none" src={`/api/radio/tracks/${track.publicId}/audio`} /></div></article>) : <div className="text-sm text-slate-500">No tracks have been published yet.</div>}</div>
    </section>
  </main>;
}
