"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Eye,
  GripVertical,
  ImagePlus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import PageHeroRotator from "@/components/page-heroes/PageHeroRotator";
import type {
  PageHeroAdminSnapshot,
  PageHeroChainItem,
  PageHeroView,
} from "@/lib/pageHeroes";

const VIEW_OPTIONS: Array<{ key: PageHeroView; label: string }> = [
  { key: "basic", label: "B" },
  { key: "advanced", label: "A" },
  { key: "extreme", label: "E" },
];

function size(bytes: number) {
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function AdminPageHeroesPage() {
  const [surface, setSurface] = useState("game-stats");
  const [snapshot, setSnapshot] = useState<PageHeroAdminSnapshot | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [previewView, setPreviewView] = useState<PageHeroView>("extreme");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  async function load(nextSurface = surface) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/page-heroes?surface=${encodeURIComponent(nextSurface)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as
        | PageHeroAdminSnapshot
        | { detail?: string };
      if (!response.ok || !("chain" in payload)) {
        throw new Error((payload as { detail?: string }).detail || "Could not load Page Heroes.");
      }
      setSnapshot(payload);
      setSurface(payload.selectedSurface.key);
      setSelectedIds([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Page Heroes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load("game-stats");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mutate(body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/page-heroes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, ...body }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | PageHeroAdminSnapshot
        | { detail?: string };
      if (!response.ok || !("chain" in payload)) {
        throw new Error((payload as { detail?: string }).detail || "Page Hero update failed.");
      }
      setSnapshot(payload);
      setNotice(label);
      return payload;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Page Hero update failed.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  function updateLocalItem(itemId: number, patch: Partial<PageHeroChainItem>) {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            chain: {
              ...current.chain,
              items: current.chain.items.map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            },
          }
        : current
    );
  }

  async function saveItem(item: PageHeroChainItem) {
    await mutate(
      {
        action: "update_item",
        itemId: item.id,
        enabled: item.enabled,
        durationMs: item.durationMs,
        views: item.views,
        focalX: item.focalX,
        focalY: item.focalY,
        overlayOpacity: item.overlayOpacity,
      },
      `${item.asset?.label || "Hero image"} saved.`
    );
  }

  async function reorder(itemIds: number[]) {
    await mutate({ action: "reorder", itemIds }, "Hero chain reordered.");
  }

  function moveItem(itemId: number, delta: number) {
    if (!snapshot) return;
    const ids = snapshot.chain.items.map((item) => item.id);
    const index = ids.indexOf(itemId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    void reorder(next);
  }

  function dropOn(targetId: number) {
    if (!snapshot || draggingId === null || draggingId === targetId) return;
    const ids = snapshot.chain.items.map((item) => item.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraggingId(null);
    void reorder(next);
  }

  const previewChain = useMemo(() => {
    if (!snapshot) return null;
    return {
      ...snapshot.chain,
      items: snapshot.chain.items.filter(
        (item) => item.enabled && item.views.includes(previewView) && item.asset?.active
      ),
    };
  }, [previewView, snapshot]);

  return (
    <main className="min-h-screen w-full max-w-none space-y-5 text-white">
      <header className="rounded-[2rem] border border-cyan-100/12 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.15),transparent_30%),radial-gradient(circle_at_90%_0%,rgba(251,191,36,0.11),transparent_28%),linear-gradient(145deg,rgba(9,20,34,0.98),rgba(3,7,15,0.98))] px-6 py-6 shadow-[0_32px_110px_rgba(0,0,0,0.34)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.34em] text-cyan-100/65">
              Admin · Visual CMS
            </div>
            <h1 className="mt-2 font-serif text-4xl">Page Hero Studio</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Media Armory owns the files. Page Hero Studio owns where they appear, their order,
              dwell time, crossfade, focal point, and B / A / E visibility.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-slate-200 hover:border-cyan-200/30"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
            <Link
              href="/admin/media-assets"
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/18 bg-amber-300/[0.06] px-4 py-2 text-sm text-amber-100"
            >
              <ImagePlus className="h-4 w-4" /> Media Armory
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-slate-300"
            >
              <ArrowLeft className="h-4 w-4" /> Admin
            </Link>
          </div>
        </div>
      </header>

      {(notice || error) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300/18 bg-rose-400/[0.07] text-rose-200"
              : "border-emerald-300/18 bg-emerald-400/[0.07] text-emerald-100"
          }`}
        >
          {error || notice}
        </div>
      )}

      {loading || !snapshot ? (
        <div className="h-96 animate-pulse rounded-[2rem] border border-white/8 bg-white/[0.025]" />
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
            <aside className="rounded-[1.7rem] border border-white/10 bg-slate-950/65 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/55">
                Hero surface
              </div>
              <select
                value={surface}
                onChange={(event) => void load(event.target.value)}
                className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white"
              >
                {snapshot.surfaces.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}{item.wired ? " · LIVE" : " · READY"}
                  </option>
                ))}
              </select>

              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">
                <div className="font-semibold text-white">{snapshot.selectedSurface.label}</div>
                <div className="mt-1 text-xs text-slate-500">{snapshot.selectedSurface.route}</div>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {snapshot.selectedSurface.description}
                </p>
                <div className="mt-3 text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/60">
                  {snapshot.selectedSurface.wired
                    ? "Connected to live page"
                    : "Chain can be prepared now · renderer hook pending"}
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <label className="grid gap-1 text-xs text-slate-400">
                  Hold each image · seconds
                  <input
                    type="number"
                    min={4}
                    max={60}
                    value={Math.round(snapshot.chain.playlist.defaultDurationMs / 1000)}
                    onChange={(event) =>
                      setSnapshot((current) =>
                        current
                          ? {
                              ...current,
                              chain: {
                                ...current.chain,
                                playlist: {
                                  ...current.chain.playlist,
                                  defaultDurationMs: Number(event.target.value) * 1000,
                                },
                              },
                            }
                          : current
                      )
                    }
                    className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  Crossfade · milliseconds
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={100}
                    value={snapshot.chain.playlist.transitionDurationMs}
                    onChange={(event) =>
                      setSnapshot((current) =>
                        current
                          ? {
                              ...current,
                              chain: {
                                ...current.chain,
                                playlist: {
                                  ...current.chain.playlist,
                                  transitionDurationMs: Number(event.target.value),
                                },
                              },
                            }
                          : current
                      )
                    }
                    className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-white"
                  />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-sm text-slate-300">
                  Autoplay
                  <input
                    type="checkbox"
                    checked={snapshot.chain.playlist.autoplay}
                    onChange={(event) =>
                      setSnapshot((current) =>
                        current
                          ? {
                              ...current,
                              chain: {
                                ...current.chain,
                                playlist: {
                                  ...current.chain.playlist,
                                  autoplay: event.target.checked,
                                },
                              },
                            }
                          : current
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void mutate(
                      {
                        action: "settings",
                        ...snapshot.chain.playlist,
                      },
                      "Hero timing saved."
                    )
                  }
                  disabled={busy !== null}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-cyan-300 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-45"
                >
                  <Save className="h-4 w-4" /> Save chain timing
                </button>
              </div>
            </aside>

            <div className="min-w-0 space-y-5">
              <section className="relative min-h-[26rem] overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#040913]">
                {previewChain ? <PageHeroRotator chain={previewChain} /> : null}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,7,16,0.84),rgba(2,7,16,0.24)),linear-gradient(180deg,transparent,rgba(2,7,16,0.82))]" />
                <div className="relative z-10 flex min-h-[26rem] flex-col justify-between p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.34em] text-cyan-100/60">
                        Live Hero Preview
                      </div>
                      <div className="mt-2 font-serif text-3xl">{snapshot.selectedSurface.label}</div>
                    </div>
                    <div className="inline-flex rounded-full border border-white/10 bg-black/35 p-1">
                      {VIEW_OPTIONS.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setPreviewView(option.key)}
                          className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full text-[10px] font-black ${
                            previewView === option.key
                              ? "bg-amber-300 text-slate-950"
                              : "text-slate-400"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="max-w-xl">
                    <div className="text-sm text-slate-300">
                      Passive cinematic crossfade. No arrows. No dots. No slideshow chrome.
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {previewChain?.items.length || 0} image(s) eligible for {previewView}.
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/58 p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/55">
                      Hero Image Library
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold">Assign from Media Armory</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void mutate(
                        { action: "assign", assetIds: selectedIds },
                        `${selectedIds.length} Hero Image${selectedIds.length === 1 ? "" : "s"} assigned.`
                      ).then((result) => result && setSelectedIds([]))
                    }
                    disabled={!selectedIds.length || busy !== null}
                    className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-45"
                  >
                    Assign selected · {selectedIds.length}
                  </button>
                </div>

                {snapshot.library.length === 0 ? (
                  <div className="mt-5 rounded-xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-slate-500">
                    No Hero Images yet. Upload them in Media Armory → Hero Images.
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {snapshot.library.map((asset) => {
                      const selected = selectedIds.includes(asset.id);
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() =>
                            setSelectedIds((current) =>
                              current.includes(asset.id)
                                ? current.filter((id) => id !== asset.id)
                                : [...current, asset.id]
                            )
                          }
                          className={`cursor-pointer overflow-hidden rounded-xl border p-2 text-left transition ${
                            selected
                              ? "border-amber-200/45 bg-amber-300/[0.08]"
                              : "border-white/9 bg-white/[0.025] hover:border-cyan-200/25"
                          }`}
                        >
                          <div className="relative aspect-video overflow-hidden rounded-lg bg-black/40">
                            <img src={asset.url} alt={asset.alt} className="h-full w-full object-cover" />
                            {selected ? (
                              <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-amber-300 text-slate-950">
                                <Check className="h-4 w-4" />
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 line-clamp-1 text-xs font-semibold text-slate-200">
                            {asset.label}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-600">{size(asset.sizeBytes)}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/58 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/55">
                  Hero Chain
                </div>
                <h2 className="mt-2 text-2xl font-semibold">Drag to reorder · tune each image</h2>
              </div>
              <div className="text-xs text-slate-500">
                {snapshot.chain.items.length} image{snapshot.chain.items.length === 1 ? "" : "s"}
              </div>
            </div>

            {snapshot.chain.items.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-white/10 px-5 py-9 text-center text-sm text-slate-500">
                Assign Hero Images above to start this chain.
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                {snapshot.chain.items.map((item, index) => (
                  <article
                    key={item.id}
                    draggable
                    onDragStart={() => setDraggingId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropOn(item.id)}
                    className={`grid gap-4 rounded-[1.3rem] border bg-black/22 p-4 lg:grid-cols-[2rem_13rem_minmax(0,1fr)_auto] lg:items-center ${
                      draggingId === item.id ? "border-amber-200/35 opacity-65" : "border-white/9"
                    }`}
                  >
                    <div className="cursor-grab text-slate-600 active:cursor-grabbing">
                      <GripVertical className="h-5 w-5" />
                    </div>

                    <div className="aspect-video overflow-hidden rounded-xl border border-white/9 bg-black/40">
                      {item.asset ? (
                        <img
                          src={item.asset.url}
                          alt={item.asset.alt}
                          className="h-full w-full object-cover"
                          style={{ objectPosition: `${item.focalX}% ${item.focalY}%` }}
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-xs text-rose-300">Missing asset</div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate font-semibold text-white">
                          {item.asset?.label || `Hero item ${item.id}`}
                        </div>
                        <label className="inline-flex items-center gap-2 rounded-full border border-white/9 px-3 py-1 text-[10px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            onChange={(event) => updateLocalItem(item.id, { enabled: event.target.checked })}
                          />
                          active
                        </label>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {VIEW_OPTIONS.map((option) => {
                          const on = item.views.includes(option.key);
                          return (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => {
                                const views = on
                                  ? item.views.filter((view) => view !== option.key)
                                  : [...item.views, option.key];
                                updateLocalItem(item.id, {
                                  views: views.length ? views : [option.key],
                                });
                              }}
                              className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full border text-[10px] font-black ${
                                on
                                  ? "border-amber-200/35 bg-amber-300/12 text-amber-100"
                                  : "border-white/9 text-slate-600"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        <label className="grid gap-1 text-[10px] text-slate-500">
                          Hold sec
                          <input
                            type="number"
                            min={4}
                            max={60}
                            value={Math.round((item.durationMs || snapshot.chain.playlist.defaultDurationMs) / 1000)}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                durationMs: Number(event.target.value) * 1000,
                              })
                            }
                            className="rounded-lg border border-white/9 bg-black/30 px-2 py-1.5 text-xs text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-[10px] text-slate-500">
                          Focal X
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.focalX}
                            onChange={(event) => updateLocalItem(item.id, { focalX: Number(event.target.value) })}
                            className="rounded-lg border border-white/9 bg-black/30 px-2 py-1.5 text-xs text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-[10px] text-slate-500">
                          Focal Y
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={item.focalY}
                            onChange={(event) => updateLocalItem(item.id, { focalY: Number(event.target.value) })}
                            className="rounded-lg border border-white/9 bg-black/30 px-2 py-1.5 text-xs text-white"
                          />
                        </label>
                        <label className="grid gap-1 text-[10px] text-slate-500">
                          Overlay
                          <input
                            type="number"
                            min={0}
                            max={0.6}
                            step={0.05}
                            value={item.overlayOpacity}
                            onChange={(event) =>
                              updateLocalItem(item.id, { overlayOpacity: Number(event.target.value) })
                            }
                            className="rounded-lg border border-white/9 bg-black/30 px-2 py-1.5 text-xs text-white"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:flex-col">
                      <button
                        type="button"
                        onClick={() => void saveItem(item)}
                        disabled={busy !== null}
                        className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-45"
                      >
                        <Save className="h-3.5 w-3.5" /> Save
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, -1)}
                        disabled={index === 0 || busy !== null}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-white/10 text-slate-300 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(item.id, 1)}
                        disabled={index === snapshot.chain.items.length - 1 || busy !== null}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-white/10 text-slate-300 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Remove ${item.asset?.label || "this image"} from this Hero chain?`)) return;
                          void mutate(
                            { action: "remove", itemId: item.id },
                            "Hero image removed from chain."
                          );
                        }}
                        disabled={busy !== null}
                        className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg border border-rose-200/15 text-rose-300 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {snapshot.selectedSurface.wired ? (
            <Link
              href={snapshot.selectedSurface.route}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200/18 bg-emerald-300/[0.06] px-5 py-3 text-sm font-semibold text-emerald-100"
            >
              <Eye className="h-4 w-4" /> Open live page
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}
