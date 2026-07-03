"use client";

import Link from "next/link";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Clapperboard,
  Copy,
  Eye,
  FileText,
  GripVertical,
  Images,
  Loader2,
  Monitor,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";

import { HeroCarousel } from "@/components/hero/HeroCarousel";
import {
  HERO_SCREEN_TYPES,
  HERO_TRANSITION_STYLES,
  type HeroPlaylistItemView,
  type HeroPlaylistSettings,
  type HeroPlaylistView,
  type HeroResolvedScreen,
  type HeroScreenConfig,
  type HeroScreenDefinition,
  type HeroScreenType,
  type HeroStudioSnapshot,
} from "@/lib/hero/types";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-xl border border-white/10 bg-[#070b14] px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-amber-200/35";
const selectClass = `${inputClass} appearance-none`;

const TYPE_LABELS: Record<HeroScreenType, string> = {
  featured_event: "Featured Event",
  chronicle_cover: "Wolo Chronicle",
  warrior_quote: "Warrior Quote",
  media_takeover: "Media Takeover",
};

const TRANSITION_LABELS = {
  crossfade: "Crossfade",
  banner_wipe: "War Banner Wipe",
  siege_push: "Siege Push",
  ember_dissolve: "Ember Dissolve",
  cut: "Hard Cut",
} as const;

function screenIcon(type: HeroScreenType) {
  if (type === "featured_event") return Clapperboard;
  if (type === "chronicle_cover") return FileText;
  if (type === "media_takeover") return Images;
  return Quote;
}

function blankScreen(type: HeroScreenType): HeroScreenDefinition {
  const label = TYPE_LABELS[type];
  const now = new Date().toISOString();
  const configs: Record<HeroScreenType, HeroScreenConfig> = {
    featured_event: {},
    chronicle_cover: {
      masthead: "THE WOLO CHRONICLE",
      editionLabel: "OPEN EDITION · THE LONG WAR CONTINUES",
      eyebrow: "HOUSE DISPATCH",
      kicker: "THE LONG WAR, RECORDED",
      theme: "chronicle",
      overlayOpacity: 0.72,
    },
    warrior_quote: {
      eyebrow: "WARRIOR QUOTE OF THE DAY",
      quote: "The calmest warrior sees the whole field.",
      attribution: "AoE2WAR House Maxim",
      subline: "Hold the line. Read the map. Choose the moment.",
      motionPreset: "embers",
      theme: "stoic",
      overlayOpacity: 0.62,
    },
    media_takeover: {
      eyebrow: "AOE2WAR PRESENTS",
      title: "Main Stage",
      subtitle: "",
      ctaLabel: "Enter",
      theme: "midnight",
      overlayOpacity: 0.45,
    },
  };
  return {
    id: 0,
    key: "",
    name: label,
    type,
    status: "draft",
    defaultHref: type === "featured_event" ? "/lobby" : "/forum",
    ariaLabel: `Open ${label}`,
    eventTileId: null,
    forumThreadId: null,
    mediaAssetId: null,
    config: configs[type],
    createdAt: now,
    updatedAt: now,
  };
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function clientResolvedScreen(
  screen: HeroScreenDefinition,
  snapshot: HeroStudioSnapshot
): HeroResolvedScreen {
  return {
    ...screen,
    eventTile:
      snapshot.eventTiles.find((event) => event.id === screen.eventTileId) || null,
    forumThread:
      snapshot.forumThreads.find((thread) => thread.id === screen.forumThreadId) ||
      null,
    mediaAsset:
      snapshot.mediaAssets.find((asset) => asset.id === screen.mediaAssetId) || null,
  };
}

function itemPayload(items: HeroPlaylistItemView[]) {
  return items.map((item) => ({
    screenId: item.screen.id,
    enabled: item.enabled,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    durationMs: item.durationMs,
    hrefOverride: item.hrefOverride,
  }));
}

function Button({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "gold" | "green" | "red";
}) {
  const toneClass = {
    neutral: "border-white/12 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
    gold: "border-amber-200/25 bg-amber-300/12 text-amber-100 hover:bg-amber-300/18",
    green:
      "border-emerald-200/25 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/16",
    red: "border-rose-200/20 bg-rose-400/8 text-rose-100 hover:bg-rose-400/14",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-slate-600">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#070b14] px-3 text-xs text-slate-300">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-amber-300"
      />
    </label>
  );
}

export default function HeroStudio() {
  const [snapshot, setSnapshot] = useState<HeroStudioSnapshot | null>(null);
  const [playlist, setPlaylist] = useState<HeroPlaylistSettings | null>(null);
  const [items, setItems] = useState<HeroPlaylistItemView[]>([]);
  const [draft, setDraft] = useState<HeroScreenDefinition>(() =>
    blankScreen("featured_event")
  );
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applySnapshot(next: HeroStudioSnapshot, selectedId?: number | null) {
    setSnapshot(next);
    setPlaylist(next.draft.playlist);
    setItems(next.draft.items);
    const targetId = selectedId ?? (draft.id || next.screens[0]?.id);
    const selected = next.screens.find((screen) => screen.id === targetId);
    if (selected) setDraft(selected);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/hero-studio", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as
        | HeroStudioSnapshot
        | { detail?: string };
      if (!response.ok || !("draft" in payload)) {
        throw new Error("detail" in payload ? payload.detail : "Hero Studio failed to load.");
      }
      applySnapshot(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Hero Studio failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function action(
    body: Record<string, unknown>,
    success: string,
    selectedId?: number | null
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/hero-studio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        snapshot?: HeroStudioSnapshot;
        resultId?: number;
        detail?: string;
      };
      if (!response.ok || !payload.snapshot) {
        throw new Error(payload.detail || "Hero Studio action failed.");
      }
      applySnapshot(payload.snapshot, selectedId ?? payload.resultId ?? null);
      setNotice(success);
      return payload.snapshot;
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : "Hero Studio action failed."
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  const selectedInChain = items.some((item) => item.screen.id === draft.id);
  const availableScreens = useMemo(
    () =>
      (snapshot?.screens || []).filter(
        (screen) =>
          screen.status !== "archived" &&
          !items.some((item) => item.screen.id === screen.id)
      ),
    [items, snapshot?.screens]
  );

  const previewPlaylist = useMemo<HeroPlaylistView | null>(() => {
    if (!snapshot || !playlist) return null;
    const previewItems = items.map((item) => {
      const definition = item.screen.id === draft.id ? draft : item.screen;
      const resolved = clientResolvedScreen(definition, snapshot);
      return {
        ...item,
        href: item.hrefOverride || definition.defaultHref || item.href || "/",
        screen: resolved,
      };
    });
    const selected = previewItems.find((item) => item.screen.id === draft.id);
    return {
      playlist: {
        ...playlist,
        autoplay: false,
        showArrows: false,
        showDots: false,
        showProgress: false,
      },
      items: selected ? [selected] : previewItems.slice(0, 1),
      publishedVersion: snapshot.liveVersion,
      publishedAt: snapshot.draft.publishedAt,
      source: "draft-bootstrap",
    };
  }, [draft, items, playlist, snapshot]);

  function patchConfig(patch: Partial<HeroScreenConfig>) {
    setDraft((current) => ({
      ...current,
      config: { ...current.config, ...patch },
    }));
  }

  function moveItem(index: number, direction: number) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((item, position) => ({ ...item, position }));
    });
  }

  function updateItem(index: number, patch: Partial<HeroPlaylistItemView>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  }

  function addScreenToChain(screen: HeroScreenDefinition) {
    if (!snapshot || items.some((item) => item.screen.id === screen.id)) return;
    const resolved = clientResolvedScreen(screen, snapshot);
    setItems((current) => [
      ...current,
      {
        id: -screen.id,
        position: current.length,
        enabled: true,
        startsAt: null,
        endsAt: null,
        durationMs: null,
        hrefOverride: "",
        href: screen.defaultHref || "/",
        screen: resolved,
      },
    ]);
  }

  async function saveScreen() {
    await action(
      {
        action: "save_screen",
        ...draft,
      },
      `${draft.name} saved.`,
      draft.id || null
    );
  }

  async function saveChain() {
    if (!playlist) return null;
    const savedPlaylist = await action(
      { action: "save_playlist", ...playlist },
      "Hero settings saved.",
      draft.id || null
    );
    if (!savedPlaylist) return null;
    return action(
      { action: "save_items", items: itemPayload(items) },
      "Hero chain saved.",
      draft.id || null
    );
  }

  async function publishChain() {
    const saved = await saveChain();
    if (!saved) return;
    await action(
      { action: "publish_playlist" },
      "Hero chain published live.",
      draft.id || null
    );
  }

  if (loading || !snapshot || !playlist) {
    return (
      <main className="grid min-h-[60vh] place-items-center text-white">
        <Loader2 className="h-9 w-9 animate-spin text-amber-200" />
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-amber-200/16 bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.20),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(59,130,246,0.15),transparent_32%),linear-gradient(145deg,#120d08,#07111c_56%,#02040a)] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.42)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-amber-100/72">
              <Sparkles className="h-4 w-4" />
              AoE2WAR Hero Studio
            </div>
            <h1 className="mt-3 font-serif text-4xl font-semibold uppercase tracking-[0.07em] text-amber-50 sm:text-6xl">
              Main Stage Director
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Build reusable screens, order the live chain, tune its motion, preview the exact public stage, and publish the full composition atomically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => void saveChain()} disabled={busy} tone="gold">
              <Save className="h-4 w-4" />
              Save chain
            </Button>
            <Button onClick={() => void publishChain()} disabled={busy} tone="green">
              <Sparkles className="h-4 w-4" />
              Publish live
            </Button>
          </div>
        </div>
        <nav className="mt-6 flex flex-wrap gap-2 text-xs">
          <Link href="/admin" className="rounded-full border border-white/10 px-3 py-2 text-slate-300 hover:text-white">
            Admin Home
          </Link>
          <Link href="/admin/events" className="rounded-full border border-white/10 px-3 py-2 text-slate-300 hover:text-white">
            Featured Event Studio
          </Link>
          <Link href="/admin/media-assets" className="rounded-full border border-white/10 px-3 py-2 text-slate-300 hover:text-white">
            Media Armory
          </Link>
          <span className="rounded-full border border-emerald-200/20 bg-emerald-300/8 px-3 py-2 text-emerald-100">
            Live revision {snapshot.liveVersion ?? "bootstrap"}
          </span>
        </nav>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-300/24 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-300/24 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-[1.6rem] border border-white/10 bg-[#030712] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              New screen
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {HERO_SCREEN_TYPES.map((type) => {
                const Icon = screenIcon(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraft(blankScreen(type))}
                    className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left transition hover:border-amber-200/24 hover:bg-amber-300/8"
                  >
                    <Icon className="h-4 w-4 text-amber-200" />
                    <span className="mt-2 block text-[10px] font-semibold leading-4 text-slate-300">
                      {TYPE_LABELS[type]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-white/10 bg-[#030712] p-3">
            <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
              Screen library
            </div>
            <div className="max-h-[62rem] space-y-2 overflow-y-auto">
              {snapshot.screens.map((screen) => {
                const Icon = screenIcon(screen.type);
                return (
                  <button
                    key={screen.id}
                    type="button"
                    onClick={() => setDraft(screen)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      draft.id === screen.id
                        ? "border-amber-200/30 bg-amber-300/10"
                        : "border-white/[0.07] bg-white/[0.025] hover:border-white/16"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-200/75" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-white">
                          {screen.name}
                        </span>
                        <span className="mt-1 block truncate text-[9px] uppercase tracking-[0.16em] text-slate-600">
                          {TYPE_LABELS[screen.type]} · {screen.status}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-5">
          <section className="rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/65">
                  <GripVertical className="h-4 w-4" />
                  Live transition chain
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  The draft order remains private until Publish Live.
                </p>
              </div>
              {availableScreens.length ? (
                <select
                  className="min-h-10 rounded-xl border border-white/10 bg-[#070b14] px-3 text-xs text-slate-200"
                  value=""
                  onChange={(event) => {
                    const screen = availableScreens.find(
                      (entry) => entry.id === Number(event.target.value)
                    );
                    if (screen) addScreenToChain(screen);
                  }}
                >
                  <option value="">+ Add a saved screen</option>
                  {availableScreens.map((screen) => (
                    <option key={screen.id} value={screen.id}>
                      {screen.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {items.map((item, index) => (
                <div
                  key={item.screen.id}
                  className="rounded-2xl border border-white/9 bg-white/[0.025] p-3"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-200/16 bg-amber-300/8 font-serif text-lg text-amber-100">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft(
                          snapshot.screens.find(
                            (screen) => screen.id === item.screen.id
                          ) || item.screen
                        )
                      }
                      className="min-w-[12rem] flex-1 text-left"
                    >
                      <span className="block text-sm font-semibold text-white">
                        {item.screen.name}
                      </span>
                      <span className="mt-1 block text-[9px] uppercase tracking-[0.18em] text-slate-600">
                        {TYPE_LABELS[item.screen.type]}
                      </span>
                    </button>
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) =>
                          updateItem(index, { enabled: event.target.checked })
                        }
                        className="h-4 w-4 accent-amber-300"
                      />
                      Enabled
                    </label>
                    <Button onClick={() => moveItem(index, -1)} disabled={index === 0}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      tone="red"
                      onClick={() =>
                        setItems((current) =>
                          current
                            .filter((_, itemIndex) => itemIndex !== index)
                            .map((entry, position) => ({ ...entry, position }))
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Display duration ms">
                      <input
                        className={inputClass}
                        type="number"
                        min="3000"
                        max="60000"
                        placeholder={`${playlist.defaultDurationMs} default`}
                        value={item.durationMs || ""}
                        onChange={(event) =>
                          updateItem(index, {
                            durationMs: Number(event.target.value) || null,
                          })
                        }
                      />
                    </Field>
                    <Field label="Link override">
                      <input
                        className={inputClass}
                        value={item.hrefOverride}
                        placeholder={item.href}
                        onChange={(event) =>
                          updateItem(index, { hrefOverride: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Starts">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        value={toDateTimeLocal(item.startsAt)}
                        onChange={(event) =>
                          updateItem(index, {
                            startsAt: event.target.value
                              ? new Date(event.target.value).toISOString()
                              : null,
                          })
                        }
                      />
                    </Field>
                    <Field label="Ends">
                      <input
                        className={inputClass}
                        type="datetime-local"
                        value={toDateTimeLocal(item.endsAt)}
                        onChange={(event) =>
                          updateItem(index, {
                            endsAt: event.target.value
                              ? new Date(event.target.value).toISOString()
                              : null,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))}
              {!items.length ? (
                <div className="rounded-2xl border border-dashed border-white/12 p-8 text-center text-sm text-slate-500">
                  Add at least one screen before publishing.
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 sm:p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/65">
              <Settings2 className="h-4 w-4" />
              Carousel direction
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Playlist name">
                <input
                  className={inputClass}
                  value={playlist.name}
                  onChange={(event) =>
                    setPlaylist({ ...playlist, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Default display ms">
                <input
                  className={inputClass}
                  type="number"
                  min="3000"
                  max="60000"
                  value={playlist.defaultDurationMs}
                  onChange={(event) =>
                    setPlaylist({
                      ...playlist,
                      defaultDurationMs: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Transition speed ms">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="3000"
                  value={playlist.transitionDurationMs}
                  onChange={(event) =>
                    setPlaylist({
                      ...playlist,
                      transitionDurationMs: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Transition style">
                <select
                  className={selectClass}
                  value={playlist.transitionStyle}
                  onChange={(event) =>
                    setPlaylist({
                      ...playlist,
                      transitionStyle: event.target
                        .value as HeroPlaylistSettings["transitionStyle"],
                    })
                  }
                >
                  {HERO_TRANSITION_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {TRANSITION_LABELS[style]}
                    </option>
                  ))}
                </select>
              </Field>
              <Toggle
                label="Autoplay"
                checked={playlist.autoplay}
                onChange={(autoplay) => setPlaylist({ ...playlist, autoplay })}
              />
              <Toggle
                label="Pause on hover/focus"
                checked={playlist.pauseOnHover}
                onChange={(pauseOnHover) =>
                  setPlaylist({ ...playlist, pauseOnHover })
                }
              />
              <Toggle
                label="Arrow controls"
                checked={playlist.showArrows}
                onChange={(showArrows) => setPlaylist({ ...playlist, showArrows })}
              />
              <Toggle
                label="Dots + progress"
                checked={playlist.showDots && playlist.showProgress}
                onChange={(value) =>
                  setPlaylist({
                    ...playlist,
                    showDots: value,
                    showProgress: value,
                  })
                }
              />
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-amber-100/65">
                  Screen definition
                </div>
                <h2 className="mt-2 text-2xl font-semibold">
                  {draft.name || "New Hero screen"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {draft.id && !selectedInChain ? (
                  <Button onClick={() => addScreenToChain(draft)} tone="gold">
                    <Plus className="h-4 w-4" />
                    Add to chain
                  </Button>
                ) : null}
                <Button onClick={() => void saveScreen()} disabled={busy} tone="gold">
                  <Save className="h-4 w-4" />
                  Save screen
                </Button>
                {draft.id ? (
                  <>
                    <Button
                      onClick={() =>
                        void action(
                          { action: "duplicate_screen", id: draft.id },
                          `${draft.name} duplicated.`
                        )
                      }
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </Button>
                    <Button
                      tone="red"
                      onClick={() =>
                        void action(
                          { action: "archive_screen", id: draft.id },
                          `${draft.name} archived.`
                        )
                      }
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Screen name">
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Stable key">
                <input
                  className={inputClass}
                  value={draft.key}
                  placeholder="wolo-chronicle-daily"
                  onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                />
              </Field>
              <Field label="Screen type">
                <select
                  className={selectClass}
                  value={draft.type}
                  onChange={(event) =>
                    setDraft(blankScreen(event.target.value as HeroScreenType))
                  }
                >
                  {HERO_SCREEN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className={selectClass}
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      status: event.target
                        .value as HeroScreenDefinition["status"],
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <Field label="Default link">
                <input
                  className={inputClass}
                  value={draft.defaultHref}
                  onChange={(event) =>
                    setDraft({ ...draft, defaultHref: event.target.value })
                  }
                />
              </Field>
              <Field label="Accessible label">
                <input
                  className={inputClass}
                  value={draft.ariaLabel}
                  onChange={(event) =>
                    setDraft({ ...draft, ariaLabel: event.target.value })
                  }
                />
              </Field>
              {draft.type === "featured_event" ? (
                <Field label="Event Studio tile">
                  <select
                    className={selectClass}
                    value={draft.eventTileId || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        eventTileId: Number(event.target.value) || null,
                      })
                    }
                  >
                    <option value="">Choose an event</option>
                    {snapshot.eventTiles.map((event) => (
                      <option key={event.id} value={event.id || ""}>
                        {event.name} · {event.status}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {draft.type === "chronicle_cover" ? (
                <Field label="War Room dispatch">
                  <select
                    className={selectClass}
                    value={draft.forumThreadId || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        forumThreadId: Number(event.target.value) || null,
                      })
                    }
                  >
                    <option value="">Choose a dispatch</option>
                    {snapshot.forumThreads.map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.title} · {thread.channel}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {draft.type !== "featured_event" ? (
                <Field label="Media asset">
                  <select
                    className={selectClass}
                    value={draft.mediaAssetId || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        mediaAssetId: Number(event.target.value) || null,
                      })
                    }
                  >
                    <option value="">No managed asset</option>
                    {snapshot.mediaAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.label} · {asset.kind}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>

            {draft.type === "chronicle_cover" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Masthead">
                  <input className={inputClass} value={draft.config.masthead || ""} onChange={(event) => patchConfig({ masthead: event.target.value })} />
                </Field>
                <Field label="Edition line">
                  <input className={inputClass} value={draft.config.editionLabel || ""} onChange={(event) => patchConfig({ editionLabel: event.target.value })} />
                </Field>
                <Field label="Eyebrow">
                  <input className={inputClass} value={draft.config.eyebrow || ""} onChange={(event) => patchConfig({ eyebrow: event.target.value })} />
                </Field>
                <Field label="Kicker">
                  <input className={inputClass} value={draft.config.kicker || ""} onChange={(event) => patchConfig({ kicker: event.target.value })} />
                </Field>
              </div>
            ) : null}

            {draft.type === "warrior_quote" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Quote">
                  <textarea className={`${inputClass} min-h-28 resize-y`} value={draft.config.quote || ""} onChange={(event) => patchConfig({ quote: event.target.value })} />
                </Field>
                <div className="grid gap-3">
                  <Field label="Attribution">
                    <input className={inputClass} value={draft.config.attribution || ""} onChange={(event) => patchConfig({ attribution: event.target.value })} />
                  </Field>
                  <Field label="Subline">
                    <input className={inputClass} value={draft.config.subline || ""} onChange={(event) => patchConfig({ subline: event.target.value })} />
                  </Field>
                </div>
                <Field label="Eyebrow">
                  <input className={inputClass} value={draft.config.eyebrow || ""} onChange={(event) => patchConfig({ eyebrow: event.target.value })} />
                </Field>
                <Field label="Motion preset">
                  <select className={selectClass} value={draft.config.motionPreset || "embers"} onChange={(event) => patchConfig({ motionPreset: event.target.value as HeroScreenConfig["motionPreset"] })}>
                    <option value="embers">Rising embers</option>
                    <option value="ink">Ink reveal</option>
                    <option value="still">Stoic still</option>
                  </select>
                </Field>
              </div>
            ) : null}

            {draft.type === "media_takeover" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Eyebrow">
                  <input className={inputClass} value={draft.config.eyebrow || ""} onChange={(event) => patchConfig({ eyebrow: event.target.value })} />
                </Field>
                <Field label="Title">
                  <input className={inputClass} value={draft.config.title || ""} onChange={(event) => patchConfig({ title: event.target.value })} />
                </Field>
                <Field label="Subtitle">
                  <input className={inputClass} value={draft.config.subtitle || ""} onChange={(event) => patchConfig({ subtitle: event.target.value })} />
                </Field>
                <Field label="CTA label">
                  <input className={inputClass} value={draft.config.ctaLabel || ""} onChange={(event) => patchConfig({ ctaLabel: event.target.value })} />
                </Field>
              </div>
            ) : null}

            {draft.type !== "featured_event" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Desktop background path">
                  <input className={inputClass} value={draft.config.backgroundImageUrl || ""} placeholder="/uploads/managed-assets/..." onChange={(event) => patchConfig({ backgroundImageUrl: event.target.value })} />
                </Field>
                <Field label="Mobile background path">
                  <input className={inputClass} value={draft.config.mobileBackgroundImageUrl || ""} onChange={(event) => patchConfig({ mobileBackgroundImageUrl: event.target.value })} />
                </Field>
                <Field label="Motion video path">
                  <input className={inputClass} value={draft.config.videoUrl || ""} placeholder="/uploads/managed-assets/motion/..." onChange={(event) => patchConfig({ videoUrl: event.target.value })} />
                </Field>
                <Field label="Video poster path">
                  <input className={inputClass} value={draft.config.posterUrl || ""} onChange={(event) => patchConfig({ posterUrl: event.target.value })} />
                </Field>
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/65">
                  <Eye className="h-4 w-4" />
                  Exact public preview
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Save a new screen and add it to the chain before previewing it here.
                </p>
              </div>
              <div className="flex rounded-xl border border-white/10 bg-black/25 p-1">
                <button type="button" onClick={() => setPreviewMode("desktop")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${previewMode === "desktop" ? "bg-amber-300 text-slate-950" : "text-slate-400"}`}>
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </button>
                <button type="button" onClick={() => setPreviewMode("mobile")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${previewMode === "mobile" ? "bg-amber-300 text-slate-950" : "text-slate-400"}`}>
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
              </div>
            </div>
            {previewPlaylist?.items.length ? (
              <div className={`mt-5 overflow-hidden ${previewMode === "mobile" ? "mx-auto max-w-[25rem]" : "w-full"}`}>
                <HeroCarousel playlist={previewPlaylist} preview />
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/12 p-10 text-center text-sm text-slate-500">
                This screen is not in the current draft chain.
              </div>
            )}
          </section>

          {snapshot.publications.length ? (
            <section className="rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 sm:p-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/65">
                <RotateCcw className="h-4 w-4" />
                Publication history
              </div>
              <div className="mt-4 grid gap-2">
                {snapshot.publications.map((publication) => (
                  <div key={publication.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        Revision {publication.version}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {new Date(publication.publishedAt).toLocaleString()} · {publication.publishedByUid || "system"}
                      </div>
                    </div>
                    {publication.version !== snapshot.liveVersion ? (
                      <Button
                        onClick={() =>
                          void action(
                            {
                              action: "rollback_playlist",
                              publicationId: publication.id,
                            },
                            `Revision ${publication.version} restored as a new live revision.`,
                            draft.id || null
                          )
                        }
                      >
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                    ) : (
                      <span className="rounded-full border border-emerald-200/20 bg-emerald-300/8 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-100">
                        Live
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <Link href="/admin" className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to Admin Home
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </main>
      </div>
    </div>
  );
}
