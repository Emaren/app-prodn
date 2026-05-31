"use client";

import { FormEvent, useEffect, useState } from "react";

import type { LiveTickerMessage } from "@/lib/liveTicker";

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatExpiry(value: string | null) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid expiry";
  return date.toLocaleString();
}

export default function LiveTickerAdminPanel() {
  const [messages, setMessages] = useState<LiveTickerMessage[]>([]);
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("0");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<Record<number, string>>({});

  async function loadMessages() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/admin/live-ticker", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LiveTickerMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string" ? payload.detail : "Could not load ticker messages."
        );
      }

      const nextMessages = Array.isArray(payload.messages)
        ? (payload.messages as LiveTickerMessage[])
        : [];
      setMessages(nextMessages);
      setEditingText(
        Object.fromEntries(nextMessages.map((message) => [message.id, message.text]))
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load ticker messages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
  }, []);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setNotice(null);

      const response = await fetch("/api/admin/live-ticker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          priority,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          enabled: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LiveTickerMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string" ? payload.detail : "Could not save ticker message."
        );
      }

      setMessages(Array.isArray(payload.messages) ? (payload.messages as LiveTickerMessage[]) : []);
      setText("");
      setPriority("0");
      setExpiresAt("");
      setNotice("Ticker message saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save ticker message.");
    } finally {
      setSaving(false);
    }
  }

  async function patchMessage(id: number, patch: Record<string, unknown>) {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/admin/live-ticker", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LiveTickerMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          typeof payload.detail === "string" ? payload.detail : "Could not update ticker message."
        );
      }

      const nextMessages = Array.isArray(payload.messages)
        ? (payload.messages as LiveTickerMessage[])
        : [];
      setMessages(nextMessages);
      setEditingText(
        Object.fromEntries(nextMessages.map((message) => [message.id, message.text]))
      );
      setNotice("Ticker message updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update ticker message.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Live Ticker</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Lobby Message Rail</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            Enabled messages join the system ticker below the site header on Advanced lobby view.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadMessages()}
          disabled={loading}
          className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <form className="mt-6 grid gap-4 lg:grid-cols-[1fr_7rem_14rem_auto]" onSubmit={submitMessage}>
        <label className="block space-y-2">
          <span className="text-sm text-slate-300">Message</span>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={160}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
            placeholder="ADMIN · Founders Cup registration opens tonight"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-slate-300">Priority</span>
          <input
            type="number"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm text-slate-300">Expires At</span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50"
          />
        </label>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving || text.trim().length < 3}
            className="min-h-12 rounded-full bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Add Message"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-[1.5rem] border border-white/8 bg-white/5 px-5 py-6 text-sm text-slate-300">
            No admin ticker messages yet.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="grid gap-4 rounded-[1.5rem] border border-white/8 bg-white/5 p-4 lg:grid-cols-[minmax(0,1fr)_8rem_13rem_auto]"
            >
              <label className="block min-w-0 space-y-2">
                <span className="text-xs uppercase tracking-[0.25em] text-slate-400">
                  Message #{message.id}
                </span>
                <input
                  value={editingText[message.id] ?? message.text}
                  onChange={(event) =>
                    setEditingText((current) => ({
                      ...current,
                      [message.id]: event.target.value,
                    }))
                  }
                  maxLength={160}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50"
                />
              </label>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Priority</div>
                <input
                  type="number"
                  value={message.priority}
                  onChange={(event) =>
                    void patchMessage(message.id, { priority: event.target.value })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Expiry</div>
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(message.expiresAt)}
                  onChange={(event) =>
                    void patchMessage(message.id, {
                      expiresAt: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50"
                  title={formatExpiry(message.expiresAt)}
                />
              </div>

              <div className="flex flex-wrap items-end gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    void patchMessage(message.id, {
                      text: editingText[message.id] ?? message.text,
                    })
                  }
                  disabled={saving}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => void patchMessage(message.id, { enabled: !message.enabled })}
                  disabled={saving}
                  className={`rounded-full border px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    message.enabled
                      ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100 hover:border-emerald-200/45"
                      : "border-white/15 text-slate-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {message.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
