"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

type HeroStageTransitionStyle = "fade" | "slide" | "cut";

type HeroStageTakeoverSlide = {
  id: string;
  imageUrl: string;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  filename: string | null;
  createdAt: string;
};

type HeroStageTakeoverState = {
  active: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  title: string | null;
  linkUrl: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  intervalMs: number;
  transitionMs: number;
  transitionStyle: HeroStageTransitionStyle;
  slides: HeroStageTakeoverSlide[];
};

const EMPTY_STATE: HeroStageTakeoverState = {
  active: false,
  imageUrl: null,
  imageAlt: null,
  title: "Jim Championship Hero",
  linkUrl: "/forum",
  startsAt: null,
  expiresAt: null,
  updatedAt: null,
  intervalMs: 8000,
  transitionMs: 900,
  transitionStyle: "fade",
  slides: [],
};

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}


function adminHeroPreviewUrl(url: string | null | undefined, width = 920) {
  if (!url) return "";
  if (!url.startsWith("/api/hero-stage-takeover/image/")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}w=${width}&fmt=webp&q=92`;
}

function slideLabel(slide: HeroStageTakeoverSlide, index: number) {
  return slide.title || slide.imageAlt || slide.filename || `Hero image ${index + 1}`;
}

export default function HeroImageTakeoverPanel() {
  const [state, setState] = useState<HeroStageTakeoverState>(EMPTY_STATE);
  const [title, setTitle] = useState(EMPTY_STATE.title || "");
  const [alt, setAlt] = useState("Jim championship hero carousel");
  const [linkUrl, setLinkUrl] = useState("/forum");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [intervalMs, setIntervalMs] = useState(8000);
  const [transitionMs, setTransitionMs] = useState(900);
  const [transitionStyle, setTransitionStyle] = useState<HeroStageTransitionStyle>("fade");
  const [replace, setReplace] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const liveLabel = state.active ? "Live carousel" : "Stage chain";

  const sortedSlides = useMemo(() => state.slides || [], [state.slides]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/hero-stage-takeover", { cache: "no-store" });
      const payload = (await response.json()) as HeroStageTakeoverState;
      if (!response.ok) {
        throw new Error((payload as unknown as { detail?: string }).detail || "Could not load hero carousel.");
      }

      setState({ ...EMPTY_STATE, ...payload, slides: payload.slides || [] });
      setTitle(payload.title || EMPTY_STATE.title || "");
      setAlt(payload.imageAlt || "Jim championship hero carousel");
      setLinkUrl(payload.linkUrl || "/forum");
      setStartsAt(toDateTimeLocal(payload.startsAt));
      setExpiresAt(toDateTimeLocal(payload.expiresAt));
      setIntervalMs(payload.intervalMs || 8000);
      setTransitionMs(payload.transitionMs ?? 900);
      setTransitionStyle(payload.transitionStyle || "fade");
      setRemoveIds([]);
      setReplace(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load hero carousel.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleRemove(id: string) {
    setRemoveIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function publish(event: FormEvent) {
    event.preventDefault();

    const remainingSlides = sortedSlides.filter((slide) => !removeIds.includes(slide.id));
    if (!files.length && !remainingSlides.length && !replace) {
      toast.error("Add at least one hero image first.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("active", "true");
      formData.set("replace", replace ? "true" : "false");
      formData.set("title", title);
      formData.set("alt", alt);
      formData.set("linkUrl", linkUrl || "/forum");
      formData.set("startsAt", startsAt);
      formData.set("expiresAt", expiresAt);
      formData.set("intervalMs", String(intervalMs));
      formData.set("transitionMs", String(transitionMs));
      formData.set("transitionStyle", transitionStyle);
      formData.set("slidesJson", JSON.stringify(replace ? [] : remainingSlides));

      files.forEach((file) => {
        formData.append("images", file);
      });

      const response = await fetch("/api/admin/hero-stage-takeover", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as HeroStageTakeoverState & { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not publish hero carousel.");
      }

      setState({ ...EMPTY_STATE, ...payload, slides: payload.slides || [] });
      setFiles([]);
      setRemoveIds([]);
      setReplace(false);
      toast.success("Hero carousel is live.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/hero-stage-takeover", {
        method: "DELETE",
      });
      const payload = (await response.json()) as HeroStageTakeoverState & { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not clear hero carousel.");
      }

      setState({ ...EMPTY_STATE, ...payload, slides: payload.slides || [] });
      setFiles([]);
      setRemoveIds([]);
      toast.success("Hero carousel cleared.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-amber-200/18 bg-[radial-gradient(circle_at_45%_0%,rgba(251,191,36,0.12),transparent_36%),rgba(2,6,23,0.78)] text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]">
        <form onSubmit={publish} className="space-y-5 border-white/10 p-5 lg:border-r">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/60">
              Multi-image hero carousel
            </div>
            <h2 className="mt-2 font-serif text-3xl font-semibold uppercase tracking-[0.12em] text-amber-50">
              Jim Championship Hero
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Add several images, set timing, and rotate the homepage hero without visible arrows.
            </p>
            <div className="mt-3 inline-flex rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100">
              {loading ? "Loading" : liveLabel}
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              Images
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              className="mt-2 block w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-slate-200 file:mr-4 file:rounded-full file:border-0 file:bg-amber-200/16 file:px-4 file:py-2 file:text-xs file:font-black file:uppercase file:tracking-[0.16em] file:text-amber-50"
            />
            {files.length ? (
              <p className="mt-2 text-xs text-emerald-200">
                {files.length} new image{files.length === 1 ? "" : "s"} staged.
              </p>
            ) : null}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Click target
              </span>
              <input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="/forum"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Title
              </span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
              Alt text
            </span>
            <input
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Seconds / image
              </span>
              <input
                type="number"
                min={2.5}
                max={60}
                step={0.5}
                value={intervalMs / 1000}
                onChange={(event) =>
                  setIntervalMs(Math.max(2500, Math.min(60000, Math.round(Number(event.target.value) * 1000))))
                }
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Fade ms
              </span>
              <input
                type="number"
                min={0}
                max={5000}
                step={100}
                value={transitionMs}
                onChange={(event) =>
                  setTransitionMs(Math.max(0, Math.min(5000, Math.round(Number(event.target.value)))))
                }
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Transition
              </span>
              <select
                value={transitionStyle}
                onChange={(event) =>
                  setTransitionStyle(event.target.value as HeroStageTransitionStyle)
                }
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              >
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="cut">Cut</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Starts
              </span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>

            <label>
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Ends
              </span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none focus:border-amber-200/30"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/24 p-3">
            <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
                className="h-4 w-4 accent-amber-300"
              />
              Replace current images
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={busy}
                className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-200 transition hover:bg-white/[0.08]"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void clear()}
                disabled={busy}
                className="rounded-full border border-red-200/20 bg-red-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-red-100 transition hover:bg-red-400/16"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full border border-emerald-200/20 bg-emerald-300/16 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-50 transition hover:bg-emerald-300/22 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Publishing…" : "Publish carousel"}
              </button>
            </div>
          </div>
        </form>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Preview chain
              </div>
              <p className="mt-1 text-sm text-slate-300">
                {sortedSlides.length} image{sortedSlides.length === 1 ? "" : "s"} live.
              </p>
            </div>
            <div className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              {intervalMs / 1000}s · {transitionStyle}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            {sortedSlides[0]?.imageUrl ? (
              <img
                src={adminHeroPreviewUrl(sortedSlides[0].imageUrl, 920)}
                alt={sortedSlides[0].imageAlt || "Hero preview"}
                className="aspect-[16/7] w-full bg-black object-contain"
                draggable={false}
              />
            ) : (
              <div className="grid aspect-[16/7] place-items-center px-6 text-center text-sm text-slate-500">
                Upload championship images here. They rotate on the homepage hero.
              </div>
            )}
          </div>

          <div className="grid gap-3">
            {sortedSlides.map((slide, index) => {
              const removing = removeIds.includes(slide.id);
              return (
                <div
                  key={slide.id}
                  className={`grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-2xl border p-2 transition ${
                    removing
                      ? "border-red-200/22 bg-red-950/20 opacity-55"
                      : "border-white/10 bg-white/[0.035]"
                  }`}
                >
                  <img
                    src={adminHeroPreviewUrl(slide.imageUrl, 320)}
                    alt={slide.imageAlt || slideLabel(slide, index)}
                    className="h-14 w-full rounded-xl bg-black object-contain"
                    draggable={false}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">
                      {index + 1}. {slideLabel(slide, index)}
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {slide.linkUrl || linkUrl || "/forum"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRemove(slide.id)}
                    className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300 hover:bg-white/[0.08]"
                  >
                    {removing ? "Keep" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Homepage side-clicks rotate the image, but no black arrow buttons are shown.
          </p>
        </div>
      </div>
    </section>
  );
}
