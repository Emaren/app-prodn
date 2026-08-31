"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useUserAuth } from "@/context/UserAuthContext";
import {
  FORUM_CHANNELS,
  type ForumSnapshot,
  type ForumThreadView,
} from "@/lib/forum";

type EditorForm = {
  title: string;
  excerpt: string;
  body: string;
  channel: string;
  tag: string;
  isPinned: boolean;
  isFeatured: boolean;
  isHot: boolean;
  isLocked: boolean;
};

function toEditorForm(thread: ForumThreadView | null): EditorForm {
  return {
    title: thread?.title ?? "",
    excerpt: thread?.excerpt ?? "",
    body: thread?.body ?? "",
    channel: thread?.channel ?? "wolo-chronicles",
    tag: thread?.tag ?? "",
    isPinned: Boolean(thread?.isPinned),
    isFeatured: Boolean(thread?.isFeatured),
    isHot: Boolean(thread?.isHot),
    isLocked: Boolean(thread?.isLocked),
  };
}

function getInitialSlug() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("slug") || "";
}

export default function ForumEditorPanel() {
  const { isAuthenticated, isAdmin, loginWithSteam } = useUserAuth();
  const [snapshot, setSnapshot] = useState<ForumSnapshot | null>(null);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [form, setForm] = useState<EditorForm>(() => toEditorForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const threads = useMemo(
    () => snapshot?.threads ?? [],
    [snapshot?.threads],
  );

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.slug === selectedSlug) ?? null,
    [threads, selectedSlug]
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/forum", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ForumSnapshot;
        if (!cancelled) {
          setSnapshot(payload);
          const initialSlug = getInitialSlug();
          const target =
            payload.threads.find((thread) => thread.slug === initialSlug) ??
            payload.threads[0] ??
            null;
          setSelectedSlug(target?.slug ?? "");
          setForm(toEditorForm(target));
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load the War Room ledger.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedThread) {
      setForm(toEditorForm(selectedThread));
      const url = new URL(window.location.href);
      url.searchParams.set("slug", selectedThread.slug);
      window.history.replaceState(null, "", url.toString());
    }
  }, [selectedThread]);

  async function save(event: FormEvent) {
    event.preventDefault();

    if (!selectedThread?.id) {
      toast.error("This dispatch is not editable yet.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_thread",
          threadId: selectedThread.id,
          ...form,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || "The dispatch could not be saved.");
      }

      setSnapshot(payload as ForumSnapshot);
      toast.success("War Room dispatch updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-5xl py-10 text-white">
        <div className="rounded-[1.6rem] border border-amber-200/18 bg-black/30 p-8">
          <h1 className="font-serif text-4xl font-semibold">War Room Editor</h1>
          <p className="mt-3 text-slate-400">Sign in as Emaren to edit dispatches.</p>
          <button
            type="button"
            onClick={() => loginWithSteam("/admin/forum-editor")}
            className="mt-6 rounded-full bg-amber-300 px-5 py-2 text-sm font-bold text-slate-950"
          >
            Steam sign in
          </button>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-5xl py-10 text-white">
        <div className="rounded-[1.6rem] border border-red-300/18 bg-red-950/20 p-8">
          <h1 className="font-serif text-4xl font-semibold">Steward rail sealed</h1>
          <p className="mt-3 text-slate-400">Only admins can edit War Room dispatches.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl py-8 text-white">
      <div className="rounded-[1.8rem] border border-amber-200/18 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.12),transparent_34%),rgba(2,6,23,0.82)] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/60">
              AoE2WAR War Room
            </div>
            <h1 className="mt-2 font-serif text-4xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-5xl">
              Dispatch Editor
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Edit the article title, deck, body, table, and feature flags. The public URL stays stable.
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/forum"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              War Room
            </Link>
            {selectedThread ? (
              <Link
                href={`/forum/thread/${selectedThread.slug}`}
                className="rounded-full border border-amber-200/18 bg-amber-300/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-amber-50 transition hover:bg-amber-300/16"
              >
                Open article
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-7">
          <label className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
            Dispatch
          </label>
          <select
            value={selectedSlug}
            onChange={(event) => setSelectedSlug(event.target.value)}
            disabled={loading}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
          >
            {threads.map((thread) => (
              <option key={thread.slug} value={thread.slug}>
                {thread.title}
              </option>
            ))}
          </select>
        </div>

        <form onSubmit={save} className="mt-6 grid gap-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Title
              </span>
              <input
                value={form.title}
                onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                maxLength={180}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Table
              </span>
              <select
                value={form.channel}
                onChange={(event) => setForm((value) => ({ ...value, channel: event.target.value }))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              >
                {FORUM_CHANNELS.map((channel) => (
                  <option key={channel.key} value={channel.key}>
                    {channel.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Deck / excerpt
              </span>
              <textarea
                value={form.excerpt}
                onChange={(event) => setForm((value) => ({ ...value, excerpt: event.target.value }))}
                maxLength={320}
                rows={3}
                className="mt-2 w-full resize-y rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Tag
              </span>
              <input
                value={form.tag}
                onChange={(event) => setForm((value) => ({ ...value, tag: event.target.value }))}
                maxLength={48}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>
          </div>

          <label>
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              Body
            </span>
            <textarea
              value={form.body}
              onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))}
              rows={16}
              maxLength={12000}
              className="mt-2 w-full resize-y rounded-[1.2rem] border border-white/10 bg-[#050b13] px-4 py-3 font-mono text-sm leading-7 text-white outline-none focus:border-amber-200/30"
            />
          </label>

          <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-black/24 p-4">
            {[
              ["isPinned", "Pinned"],
              ["isFeatured", "Featured"],
              ["isHot", "Hot"],
              ["isLocked", "Locked"],
            ].map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(form[key as keyof EditorForm])}
                  onChange={(event) =>
                    setForm((value) => ({ ...value, [key]: event.target.checked }))
                  }
                  className="h-4 w-4 accent-amber-300"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={() => selectedThread && setForm(toEditorForm(selectedThread))}
              className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              Revert local edits
            </button>
            <button
              type="submit"
              disabled={saving || !selectedThread?.id}
              className="rounded-full bg-amber-300 px-6 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save dispatch"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
