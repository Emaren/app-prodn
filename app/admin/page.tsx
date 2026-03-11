"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  getFallbackTournament,
  getTournamentStatusLabel,
  TOURNAMENT_STATUSES,
  type LobbyTournament,
} from "@/lib/lobby";

type FormState = {
  id: number | null;
  title: string;
  description: string;
  format: string;
  status: string;
  startsAt: string;
};

function toFormState(tournament: LobbyTournament | null): FormState {
  const base = tournament ?? getFallbackTournament(false);
  return {
    id: base.id,
    title: base.title,
    description: base.description,
    format: base.format,
    status: base.status,
    startsAt: base.startsAt ? toDateTimeLocal(base.startsAt) : "",
  };
}

export default function AdminPage() {
  const { isAuthenticated, isAdmin } = useUserAuth();
  const [form, setForm] = useState<FormState>(() => toFormState(null));
  const [tournament, setTournament] = useState<LobbyTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin) {
      setLoading(false);
      return;
    }

    let active = true;

    (async () => {
      try {
        const response = await fetch("/api/admin/tournament", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as
          | { detail?: string; tournament?: LobbyTournament }
          | Record<string, unknown>;

        if (!response.ok) {
          throw new Error(typeof payload.detail === "string" ? payload.detail : "Failed to load tournament.");
        }

        if (!active) return;

        const nextTournament = (payload.tournament as LobbyTournament) || getFallbackTournament(false);
        setTournament(nextTournament);
        setForm(toFormState(nextTournament));
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load tournament.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isAdmin, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-4 text-sm text-slate-300">
            Admin routes now sit behind the signed session model. Sign in first, then open the dedicated admin pages.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Back To Lobby
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-4 text-sm text-slate-300">
            Your account is signed in, but it does not have admin access.
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const response = await fetch("/api/admin/tournament", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          title: form.title,
          description: form.description,
          format: form.format,
          status: form.status,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; tournament?: LobbyTournament }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Save failed.");
      }

      const nextTournament = (payload.tournament as LobbyTournament) || null;
      setTournament(nextTournament);
      setForm(toFormState(nextTournament));
      setNotice("Featured tournament updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl py-10 text-white">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold">Admin</h1>
              <p className="mt-4 text-sm text-slate-300">
                This is the control point for the homepage tournament card. Save here, then the lobby updates on the next poll.
              </p>
            </div>
            <Link
              href="/admin/user-list"
              className="inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Open User List
            </Link>
          </div>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                placeholder="Spring Ladder Cup"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Description</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={5}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                placeholder="Short tournament pitch, stakes, and who should join."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Format</span>
                <input
                  value={form.format}
                  onChange={(event) => setForm((current) => ({ ...current, format: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                  placeholder="1v1 AoE2HD showcase"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Status</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                >
                  {TOURNAMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {getTournamentStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">Starts At</span>
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startsAt: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
                />
              </label>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            {notice && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Featured Tournament"}
            </button>
          </form>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Preview</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {loading ? "Loading..." : tournament?.title || form.title || "Featured Tournament"}
          </h2>
          <p className="mt-3 text-sm text-slate-300">
            {tournament?.description || form.description || "No tournament has been published yet."}
          </p>

          <div className="mt-6 space-y-4 rounded-[1.5rem] border border-white/8 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-300">{tournament?.format || form.format}</div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {getTournamentStatusLabel((tournament?.status || form.status) as LobbyTournament["status"])}
              </div>
            </div>
            <div className="text-3xl font-semibold text-white">{tournament?.entryCount || 0}</div>
            <div className="text-sm text-slate-400">Current entrants</div>
            <div className="text-sm text-slate-300">
              {form.startsAt ? `Starts ${new Date(form.startsAt).toLocaleString()}` : "Start time not set"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}
