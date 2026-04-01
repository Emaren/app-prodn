import ContactEmarenWorkspace from "@/components/contact/ContactEmarenWorkspace";

export const dynamic = "force-dynamic";

export default function ContactEmarenPage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden py-0 text-white sm:gap-4">
      <section className="shrink-0 overflow-hidden rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-5 sm:p-6">
        <div className="max-w-3xl space-y-2">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Direct Line</div>
          <h1 className="text-2xl font-semibold text-white sm:text-3xl">
            Contact Emaren + The AI Scribe
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-300">
            Keep the human line with Emaren open, or switch to The AI Scribe for fast site help,
            replay questions, leaderboard context, and WOLO guidance.
          </p>
        </div>
      </section>

      <div className="min-h-0 flex-1">
        <ContactEmarenWorkspace />
      </div>
    </div>
  );
}
