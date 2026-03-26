import ContactEmarenWorkspace from "@/components/contact/ContactEmarenWorkspace";

export const dynamic = "force-dynamic";

export default function ContactEmarenPage() {
  return (
    <main className="space-y-4 py-5 text-white sm:space-y-6 sm:py-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-6 sm:p-8">
        <div className="max-w-3xl space-y-3">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Direct Line</div>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">Contact Emaren</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Private thread. Real identities. No ticket system.
          </p>
        </div>
      </section>

      <ContactEmarenWorkspace />
    </main>
  );
}
