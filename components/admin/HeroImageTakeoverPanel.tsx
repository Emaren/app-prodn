"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";

type HeroTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  originalName: string | null;
  updatedAt: string | null;
};

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
  ].join("");
}

function defaultTonightValue() {
  const end = new Date();
  end.setHours(23, 59, 0, 0);

  if (end.getTime() <= Date.now()) {
    end.setDate(end.getDate() + 1);
  }

  return toDateTimeLocalValue(end);
}

function displayDate(value: string | null) {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString();
}

export default function HeroImageTakeoverPanel() {
  const [state, setState] = useState<HeroTakeoverState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const [title, setTitle] = useState("Jim Wins the American Championship");
  const [imageAlt, setImageAlt] = useState("Jim celebrating after winning the American Championship");
  const [linkUrl, setLinkUrl] = useState("/players/jim");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultTonightValue);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localPreview = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  async function loadState() {
    setError(null);

    try {
      const response = await fetch("/api/admin/hero-stage-takeover", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as HeroTakeoverState & { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not load hero takeover state.");
      }

      setState(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load hero takeover state.");
    }
  }

  useEffect(() => {
    void loadState();
  }, []);

  async function handlePublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Choose Jim's celebration image first.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("imageAlt", imageAlt);
      formData.append("linkUrl", linkUrl);

      if (startsAt) {
        formData.append("startsAt", new Date(startsAt).toISOString());
      }

      if (expiresAt) {
        formData.append("expiresAt", new Date(expiresAt).toISOString());
      }

      const response = await fetch("/api/admin/hero-stage-takeover", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as HeroTakeoverState & { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not publish hero takeover.");
      }

      setState(payload);
      setFile(null);
      setFileInputKey((key) => key + 1);
      setNotice("Hero takeover is live. One image. No carousel.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Could not publish hero takeover.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/hero-stage-takeover", {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as HeroTakeoverState & { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not clear hero takeover.");
      }

      setState(payload);
      setNotice("Hero takeover cleared. The normal stage chain is back.");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear hero takeover.");
    } finally {
      setBusy(false);
    }
  }

  const previewUrl = localPreview || state?.imageUrl || null;

  return (
    <section className="mb-4 overflow-hidden rounded-[1.65rem] border border-amber-200/20 bg-black/48 shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.78fr)]">
        <form onSubmit={handlePublish} className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[0.64rem] font-semibold uppercase tracking-[0.34em] text-amber-100/75">
                <ImagePlus className="h-3.5 w-3.5" />
                One-image hero takeover
              </div>
              <h2 className="mt-2 font-serif text-2xl font-semibold uppercase tracking-[0.14em] text-white sm:text-3xl">
                Jim championship hero
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Upload one image and it replaces the normal hero stage until the expiry time. No carousel. No rotation.
              </p>
            </div>

            <div className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-amber-100">
              {state?.active ? "Live override" : "Stage chain"}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Image</span>
              <input
                key={fileInputKey}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="block w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-200/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-amber-100"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Click target</span>
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="/players/jim"
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-200/40"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-200/40"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Alt text</span>
              <input
                value={imageAlt}
                onChange={(event) => setImageAlt(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-200/40"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Starts</span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-200/40"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Ends</span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-amber-200/40"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/24 bg-emerald-300/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:bg-emerald-300/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud className="h-4 w-4" />
              Publish image
            </button>

            <button
              type="button"
              onClick={() => void loadState()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-red-100 transition hover:bg-red-400/16 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>

          {notice ? <p className="text-sm text-emerald-200">{notice}</p> : null}
          {error ? <p className="text-sm text-red-200">{error}</p> : null}
        </form>

        <div className="border-t border-white/10 bg-slate-950/46 p-4 lg:border-l lg:border-t-0 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[0.62rem] uppercase tracking-[0.24em] text-slate-500">Preview</div>
            <div className="text-right text-[0.68rem] uppercase tracking-[0.18em] text-slate-400">
              Ends: {displayDate(state?.expiresAt || null)}
            </div>
          </div>

          <div className="relative min-h-[15rem] overflow-hidden rounded-2xl border border-white/10 bg-black">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={state?.imageAlt || imageAlt}
                className="absolute inset-0 h-full w-full object-contain"
              />
            ) : (
              <div className="flex min-h-[15rem] items-center justify-center px-6 text-center text-sm text-slate-500">
                Upload Jim’s celebration image here. This preview becomes the homepage hero.
              </div>
            )}
          </div>

          <div className="mt-3 text-xs leading-5 text-slate-400">
            Current file: <span className="text-slate-200">{file?.name || state?.originalName || "none"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
