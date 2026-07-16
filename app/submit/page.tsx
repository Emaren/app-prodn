import type { Metadata } from "next";
import Link from "next/link";
import RadioSubmissionForm from "@/components/radio/RadioSubmissionForm";

export const metadata: Metadata = { title: "Submit Music to Radio WOLO", description: "A durable creator submission route for music intended for Radio WOLO." };
export default function SubmitMusicPage() { return <main className="space-y-7 py-7 text-white"><section className="rounded-[2.2rem] border border-fuchsia-100/12 bg-[radial-gradient(circle_at_18%_0%,rgba(232,121,249,0.18),transparent_34%),linear-gradient(145deg,#15091a,#060811_62%)] p-7 sm:p-11"><div className="text-xs font-bold uppercase tracking-[0.4em] text-fuchsia-100/60">Creator Gate</div><h1 className="mt-4 max-w-4xl font-serif text-5xl leading-none sm:text-7xl">Submit music to Radio WOLO.</h1><p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Send the track, artwork, contact path, and a limited permission to review and play it. You keep your copyright. Private contact and review notes never appear on the public station.</p><Link href="/radio" className="mt-6 inline-flex rounded-full border border-white/14 bg-white/[0.05] px-5 py-3 text-sm font-semibold">Visit Radio WOLO</Link></section><RadioSubmissionForm /></main>; }

