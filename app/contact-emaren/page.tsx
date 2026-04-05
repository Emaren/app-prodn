import ContactEmarenWorkspace from "@/components/contact/ContactEmarenWorkspace";

export const dynamic = "force-dynamic";

export default function ContactEmarenPage() {
  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-2 overflow-hidden py-0 text-white sm:gap-3">
      <section className="shrink-0 overflow-hidden rounded-[1.6rem] border border-white/8 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-4 sm:p-5">
        <div className="max-w-3xl space-y-1.5">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Direct Line</div>
          <h1 className="text-xl font-semibold text-white sm:text-2xl">
            Contact Emaren, The AI Scribe, or Grimer
          </h1>
          <p className="max-w-2xl text-sm leading-5 text-slate-300 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            Keep the human line with Emaren open, lean on The AI Scribe for sharp site help and
            replay context, or let Grimer throw a darker little jab into the room when you want
            extra colour.
          </p>
        </div>
      </section>

      <div className="min-h-0 flex-1">
        <ContactEmarenWorkspace />
      </div>
    </div>
  );
}
