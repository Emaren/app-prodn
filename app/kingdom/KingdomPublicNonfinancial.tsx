import Link from "next/link";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import KingdomHero from "./KingdomHero";

const chapters = [
  { href: "/kingdom-progress", title: "Kingdom Progress", body: "Verified source milestones, with missing evidence left UNKNOWN." },
  { href: "/kingdom-construction", title: "Kingdom Construction", body: "A public view of the Kingdom's proposed nonexecuting architecture." },
  { href: "/round-chamber", title: "Round Chamber", body: "The public civic chamber, without an implied live voting or treasury mandate." },
  { href: "/kingdom-forge", title: "Kingdom Forge", body: "Explore the Forge's public vision, not a funding or mint authorization." },
] as const;

export default function KingdomPublicNonfinancial() {
  return (
    <main data-public-read-model="static-public-only"
      className="mx-auto max-w-[112rem] space-y-7 px-4 py-7 text-white sm:px-7">
      <SpeedReadyMarker route="/kingdom" />
      <KingdomHero featuredStats={[]} />
      <p role="status" className="rounded-2xl border border-amber-200/25 bg-slate-950/80 p-5 text-sm text-amber-100">
        The Kingdom&apos;s public chronicle is available. Live player totals,
        treasury balances, claim actions and financial activity are not
        certified under this nonfinancial production role. Those values are
        UNKNOWN rather than zero. No wagers, wallets or settlement operations
        are available from this view.
      </p>
      <section aria-label="Public Kingdom chapters" className="grid gap-4 md:grid-cols-2">
        {chapters.map((chapter) => (
          <article key={chapter.href}
            className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
            <h2 className="text-2xl font-semibold">{chapter.title}</h2>
            <p className="my-3 text-sm leading-6 text-slate-300">{chapter.body}</p>
            <Link className="text-sm text-cyan-300 underline underline-offset-4" href={chapter.href}>
              Explore the public chapter
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
