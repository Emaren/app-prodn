import ContactEmarenWorkspace from "@/components/contact/ContactEmarenWorkspace";

export const dynamic = "force-dynamic";

export default function ContactEmarenPage() {
  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#020617)] p-8">
        <div className="max-w-4xl space-y-4">
          <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Direct Line</div>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">Contact Emaren</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            This is the private line between you and Emaren. It is meant to feel personal, fast, and
            premium: no floating widget, no anonymous dropbox, just a direct thread tied to real
            AoE2HDBets identities.
          </p>
        </div>
      </section>

      <ContactEmarenWorkspace />
    </main>
  );
}
