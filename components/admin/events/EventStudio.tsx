"use client";

import type { EventStudioMediaAsset } from "@/lib/events/types";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CalendarRange,
  CheckCircle2,
  Copy,
  Crown,
  Eye,
  Home,
  Images,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  Sparkles,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { WolomaniaPromoTile } from "@/components/lobby/WolomaniaPromoTile";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  EVENT_TILE_STATUSES,
  FALLBACK_EVENT_TILE,
  DEFAULT_EVENT_TILE_STYLE_CONFIG,
  type EventStudioSnapshot,
  type EventStudioUser,
  type EventTileStatus,
  type EventTileView,
} from "@/lib/events/types";

type PreviewMode = "desktop" | "mobile";

const inputClass =
  "block w-full !min-w-0 max-w-full rounded-xl border border-white/[0.12] bg-[#050914] px-3 py-2.5 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] outline-none [color-scheme:dark] placeholder:text-slate-600 selection:bg-amber-300/25 selection:text-white focus:border-amber-200/45 focus:bg-[#080e1c] focus:ring-2 focus:ring-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass = `${inputClass} pr-9`;

const dateInputClass = `${inputClass} min-h-11 text-[13px] sm:text-sm`;

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin Home", Icon: Home },
  { href: "/admin/hero-studio", label: "Hero Studio", Icon: Sparkles },
  { href: "/admin/events", label: "Featured Event", Icon: CalendarRange },
  { href: "/admin/trophies", label: "Trophy Command", Icon: Crown },
  { href: "/admin/media-assets", label: "Media Armory", Icon: Images },
] as const;

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
    <label className="block min-w-0 max-w-full space-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px] leading-4 text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Button({
  children,
  onClick,
  disabled,
  tone = "neutral",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "gold" | "danger" | "green";
}) {
  const toneClass = {
    neutral: "border-white/[0.12] bg-[#0b1220] text-slate-200 hover:border-white/25 hover:bg-[#101a2b]",
    gold: "border-amber-200/25 bg-amber-300/[0.13] text-amber-100 hover:bg-amber-300/[0.2]",
    danger: "border-rose-300/25 bg-rose-400/[0.11] text-rose-100 hover:bg-rose-400/[0.17]",
    green: "border-emerald-300/25 bg-emerald-400/[0.11] text-emerald-100 hover:bg-emerald-400/[0.17]",
  }[tone];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition disabled:cursor-not-allowed disabled:opacity-45 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function blankEvent(): EventTileView {
  return {
    ...FALLBACK_EVENT_TILE,
    id: null,
    eventTileId: "",
    slug: "",
    status: "draft",
    priority: 0,
    isPublished: false,
    isActive: false,
    name: "",
    title: "",
    subtitle: "",
    publishedAt: null,
    createdAt: null,
    updatedAt: null,
    source: "database",
  };
}

function publishMissing(event: EventTileView) {
  return [
    ["event id", event.eventTileId],
    ["slug", event.slug],
    ["name", event.name],
    ["eyebrow", event.eyebrow],
    ["title", event.title],
    ["chapter label", event.chapterLabel],
    ["date label", event.dateLabel],
    ["CTA label", event.ctaLabel],
    ["CTA URL", event.ctaUrl],
    ["player one name", event.playerOneName],
    ["player one avatar", event.playerOneAvatarUrl],
    ["player two name", event.playerTwoName],
    ["player two avatar", event.playerTwoAvatarUrl],
    ["Commissioner name", event.commissionerName],
    ["Commissioner avatar", event.commissionerAvatarUrl],
    ["belt image", event.beltImageUrl],
  ]
    .filter(([, value]) => !String(value || "").trim())
    .map(([label]) => label);
}

function statusTone(event: EventTileView) {
  if (event.status === "archived") return "border-slate-400/15 bg-slate-400/8 text-slate-400";
  if (event.isActive && event.isPublished) {
    return "border-emerald-300/24 bg-emerald-400/10 text-emerald-100";
  }
  if (event.isPublished) return "border-sky-300/20 bg-sky-400/10 text-sky-100";
  return "border-amber-300/18 bg-amber-400/8 text-amber-100";
}

function applySelectedUser(
  current: EventTileView,
  user: EventStudioUser | undefined,
  role: "playerOne" | "playerTwo" | "commissioner"
) {
  const idKey = `${role}UserId` as const;
  const nameKey = `${role}Name` as const;
  const avatarKey = `${role}AvatarUrl` as const;
  const countryKey =
    role === "playerOne" ? "playerOneCountry" : role === "playerTwo" ? "playerTwoCountry" : null;
  return {
    ...current,
    [idKey]: user?.id ?? null,
    [nameKey]: user?.name ?? current[nameKey],
    [avatarKey]: user?.avatarUrl ?? current[avatarKey],
    ...(countryKey ? { [countryKey]: user?.representedCountry ?? null } : {}),
  };
}


function applyStylePatch(
  current: EventTileView,
  patch: Partial<EventTileView["styleConfig"]>
): EventTileView {
  return {
    ...current,
    styleConfig: {
      ...DEFAULT_EVENT_TILE_STYLE_CONFIG,
      ...(current.styleConfig || DEFAULT_EVENT_TILE_STYLE_CONFIG),
      ...patch,
    },
  };
}

function numericStyleValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function EventStudio() {
  const { isAuthenticated, isAdmin, loading: authLoading } = useUserAuth();
  const [snapshot, setSnapshot] = useState<EventStudioSnapshot | null>(null);
  const [draft, setDraft] = useState<EventTileView>(() => blankEvent());
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/events", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as
        | EventStudioSnapshot
        | { detail?: string };
      if (!response.ok || !("events" in payload)) {
        throw new Error("detail" in payload ? payload.detail : "Event Studio failed to load.");
      }
      setSnapshot(payload);
      setDraft((current) => {
        if (current.id) {
          return payload.events.find((event) => event.id === current.id) || current;
        }
        return payload.events[0] || current;
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Event Studio failed to load.");
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAdmin, isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (
      payload: Record<string, unknown>,
      success: string,
      selectResult = true
    ) => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/admin/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = (await response.json().catch(() => ({}))) as {
          detail?: string;
          resultId?: number;
          snapshot?: EventStudioSnapshot;
        };
        if (!response.ok || !result.snapshot) {
          throw new Error(result.detail || "Event Studio action failed.");
        }
        setSnapshot(result.snapshot);
        if (selectResult && result.resultId) {
          const selected = result.snapshot.events.find((event) => event.id === result.resultId);
          if (selected) setDraft(selected);
        } else if (draft.id) {
          const refreshed = result.snapshot.events.find((event) => event.id === draft.id);
          if (refreshed) setDraft(refreshed);
        }
        setNotice(success);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Event Studio action failed.");
      } finally {
        setBusy(false);
      }
    },
    [draft.id]
  );

  const missing = useMemo(() => publishMissing(draft), [draft]);
  const styleConfig = draft.styleConfig || DEFAULT_EVENT_TILE_STYLE_CONFIG;

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="flex min-h-44 items-center justify-center rounded-[2rem] border border-white/10 bg-[#030712] p-8">
          <Loader2 className="h-7 w-7 animate-spin text-amber-100" aria-label="Loading admin session" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-rose-300/20 bg-slate-950/80 p-8">
          <AlertTriangle className="h-8 w-8 text-rose-200" />
          <h1 className="mt-4 text-3xl font-semibold">Admin access required</h1>
          <p className="mt-3 text-slate-400">
            Publishing the main lobby event is operator-only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="event-studio"
      className="mx-auto w-full min-w-0 max-w-[96rem] space-y-5 overflow-x-hidden py-6 text-white"
    >
      <section className="overflow-hidden rounded-[2rem] border border-amber-200/[0.16] bg-[radial-gradient(circle_at_15%_0%,rgba(251,191,36,0.18),transparent_30%),radial-gradient(circle_at_88%_15%,rgba(59,130,246,0.12),transparent_30%),linear-gradient(145deg,#120d08,#07111c_56%,#02040a)] p-5 shadow-[0_36px_120px_rgba(0,0,0,0.42)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-amber-100/[0.72]">
              <CalendarRange className="h-4 w-4" />
              AoE2WAR Featured Event Studio
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-5xl">
              Featured Event Foundry
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
              Build and preview the Featured Event here. Click Make live and every Featured Event screen on the site updates immediately; Hero Studio only controls where that screen sits in the rotation.
            </p>
          </div>
          <Button onClick={() => void load()} disabled={loading || busy}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <nav className="mt-6 flex gap-2 overflow-x-auto pb-1">
          {ADMIN_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs transition ${
                href === "/admin/events"
                  ? "border-amber-200/[0.28] bg-amber-300/[0.12] text-amber-100"
                  : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
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

      {loading || !snapshot ? (
        <div className="grid min-h-64 place-items-center rounded-[2rem] border border-white/10 bg-black/20">
          <Loader2 className="h-8 w-8 animate-spin text-amber-200" />
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3">
            <button
              type="button"
              onClick={() => {
                setDraft(blankEvent());
                setNotice(null);
                setError(null);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200/20 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/16"
            >
              <Plus className="h-4 w-4" />
              New event
            </button>
            <div className="max-h-[70rem] space-y-2 overflow-y-auto pr-1">
              {snapshot.events.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setDraft(event)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    draft.id === event.id
                      ? "border-amber-200/30 bg-amber-300/10"
                      : "border-white/[0.08] bg-[#050914] hover:border-white/[0.18]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{event.name}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{event.eventTileId}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.13em] ${statusTone(event)}`}>
                      {event.isActive && event.isPublished ? "LIVE" : event.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <span>Priority {event.priority}</span>
                    <span>{event.isPublished ? "Published" : "Unpublished"}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 space-y-5">
            <section className="min-w-0 overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.3em] text-amber-100/[0.65]">
                    Event definition
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold">
                    {draft.id ? draft.name : "New Event Tile"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    tone="gold"
                    disabled={busy}
                    onClick={() =>
                      void runAction({ action: "save", ...draft }, "Event Tile saved.")
                    }
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </Button>
                  <Button
                    disabled={busy || !draft.id}
                    onClick={() =>
                      void runAction(
                        { action: "duplicate", id: draft.id },
                        "Draft duplicate created."
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate
                  </Button>
                  <Button
                    tone="green"
                    disabled={busy || !draft.id || missing.length > 0}
                    onClick={() =>
                      void runAction(
                        { action: "set_active", id: draft.id },
                        "Event is live everywhere the Featured Event screen appears."
                      )
                    }
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Make live
                  </Button>
                  {draft.isPublished ? (
                    <Button
                      disabled={busy || !draft.id}
                      onClick={() =>
                        void runAction(
                          { action: "unpublish", id: draft.id },
                          "Event unpublished."
                        )
                      }
                    >
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      disabled={busy || !draft.id || missing.length > 0}
                      onClick={() =>
                        void runAction(
                          { action: "publish", id: draft.id },
                          "Event published."
                        )
                      }
                    >
                      Publish
                    </Button>
                  )}
                  <Button
                    tone="danger"
                    disabled={busy || !draft.id}
                    onClick={() => {
                      if (window.confirm(`Archive ${draft.name}? It will leave the public stage.`)) {
                        void runAction(
                          { action: "archive", id: draft.id },
                          "Event archived."
                        );
                      }
                    }}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </Button>
                </div>
              </div>

              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                missing.length
                  ? "border-amber-200/[0.16] bg-amber-300/[0.08] text-amber-50/[0.8]"
                  : "border-emerald-300/[0.18] bg-emerald-400/[0.08] text-emerald-100"
              }`}>
                <div className="flex items-center gap-2 font-semibold">
                  {missing.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {missing.length ? "Publish checklist incomplete" : "Ready to publish"}
                </div>
                {missing.length ? (
                  <div className="mt-1 text-xs leading-5">Add: {missing.join(", ")}.</div>
                ) : (
                  <div className="mt-1 text-xs">All required stage, art, player, and CTA fields are present.</div>
                )}
              </div>

              <div className="mt-6 space-y-6">
                <EditorSection title="Identity and hierarchy" icon={Crown}>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <Field label="Event tile id">
                      <input className={inputClass} value={draft.eventTileId} onChange={(event) => setDraft((current) => ({ ...current, eventTileId: event.target.value }))} placeholder="wolomania-ii" />
                    </Field>
                    <Field label="Slug">
                      <input className={inputClass} value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))} placeholder="wolomania-ii" />
                    </Field>
                    <Field label="Status">
                      <select className={selectClass} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as EventTileStatus }))}>
                        {EVENT_TILE_STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </Field>
                    <Field label="Priority">
                      <input className={inputClass} type="number" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: Number(event.target.value) || 0 }))} />
                    </Field>
                    <Field label="Event name">
                      <input className={inputClass} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Wolomania" />
                    </Field>
                    <Field label="Eyebrow">
                      <input className={inputClass} value={draft.eyebrow} onChange={(event) => setDraft((current) => ({ ...current, eyebrow: event.target.value }))} placeholder="The World Championship Event" />
                    </Field>
                    <Field label="Main title">
                      <input className={inputClass} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="WOLOMANIA" />
                    </Field>
                    <Field label="Title suffix / subtitle">
                      <input className={inputClass} value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} placeholder="I" />
                    </Field>
                    <div className="sm:col-span-2 xl:col-span-4">
                      <Field label="Description">
                        <textarea className={inputClass} rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
                      </Field>
                    </div>
                  </div>
                </EditorSection>


                <EditorSection title="Featured Event title style" icon={Type}>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <Field label="Font family / type" hint="CSS font stack. Example: Georgia, serif">
                      <input
                        className={inputClass}
                        value={styleConfig.titleFontFamily}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleFontFamily: event.target.value }))}
                        placeholder='Georgia, "Times New Roman", serif'
                      />
                    </Field>
                    <Field label="Title color">
                      <input
                        className={inputClass}
                        type="color"
                        value={styleConfig.titleColor}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleColor: event.target.value }))}
                      />
                    </Field>
                    <Field label="Desktop size">
                      <input
                        className={inputClass}
                        value={styleConfig.titleDesktopSize}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleDesktopSize: event.target.value }))}
                        placeholder="clamp(4.1rem,9.2vw,10rem)"
                      />
                    </Field>
                    <Field label="Mobile size">
                      <input
                        className={inputClass}
                        value={styleConfig.titleMobileSize}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleMobileSize: event.target.value }))}
                        placeholder="clamp(3.4rem,16vw,4.8rem)"
                      />
                    </Field>
                    <Field label="Weight">
                      <select
                        className={selectClass}
                        value={styleConfig.titleWeight}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleWeight: Number(event.target.value) }))}
                      >
                        {[300, 400, 500, 600, 700, 800, 900, 1000].map((weight) => (
                          <option key={weight} value={weight}>{weight}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Style">
                      <select
                        className={selectClass}
                        value={styleConfig.titleStyle}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleStyle: event.target.value as EventTileView["styleConfig"]["titleStyle"] }))}
                      >
                        <option value="normal">normal</option>
                        <option value="italic">italic</option>
                      </select>
                    </Field>
                    <Field label="Transform">
                      <select
                        className={selectClass}
                        value={styleConfig.titleTransform}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleTransform: event.target.value as EventTileView["styleConfig"]["titleTransform"] }))}
                      >
                        <option value="uppercase">uppercase</option>
                        <option value="none">none</option>
                        <option value="capitalize">capitalize</option>
                      </select>
                    </Field>
                    <Field label="Text align">
                      <select
                        className={selectClass}
                        value={styleConfig.titleAlign}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleAlign: event.target.value as EventTileView["styleConfig"]["titleAlign"] }))}
                      >
                        <option value="left">left</option>
                        <option value="center">center</option>
                        <option value="right">right</option>
                      </select>
                    </Field>
                    <Field label="Letter spacing">
                      <input
                        className={inputClass}
                        value={styleConfig.titleLetterSpacing}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleLetterSpacing: event.target.value }))}
                        placeholder="-0.045em"
                      />
                    </Field>
                    <Field label="Line height">
                      <input
                        className={inputClass}
                        value={styleConfig.titleLineHeight}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleLineHeight: event.target.value }))}
                        placeholder="0.78"
                      />
                    </Field>
                    <Field label="Desktop top %" hint="Moves the full title block up/down.">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.1"
                        value={styleConfig.titleDesktopTop}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleDesktopTop: numericStyleValue(event.target.value, styleConfig.titleDesktopTop) }))}
                      />
                    </Field>
                    <Field label="Desktop left %" hint="50 keeps it centered.">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.1"
                        value={styleConfig.titleDesktopLeft}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleDesktopLeft: numericStyleValue(event.target.value, styleConfig.titleDesktopLeft) }))}
                      />
                    </Field>
                    <Field label="Desktop width %">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.5"
                        value={styleConfig.titleDesktopWidth}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleDesktopWidth: numericStyleValue(event.target.value, styleConfig.titleDesktopWidth) }))}
                      />
                    </Field>
                    <Field label="Mobile title nudge px" hint="Negative moves up. Positive moves down.">
                      <input
                        className={inputClass}
                        type="number"
                        step="1"
                        value={styleConfig.titleMobileNudge}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleMobileNudge: numericStyleValue(event.target.value, styleConfig.titleMobileNudge) }))}
                      />
                    </Field>
                    <Field label="Rotate degrees">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.25"
                        value={styleConfig.titleRotate}
                        onChange={(event) => setDraft((current) => applyStylePatch(current, { titleRotate: numericStyleValue(event.target.value, styleConfig.titleRotate) }))}
                      />
                    </Field>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="min-h-11 w-full rounded-xl border border-amber-200/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/16"
                        onClick={() => setDraft((current) => ({ ...current, styleConfig: DEFAULT_EVENT_TILE_STYLE_CONFIG }))}
                      >
                        Reset title style
                      </button>
                    </div>
                  </div>
                </EditorSection>

                <EditorSection title="Timing, badges, and conversion" icon={CalendarRange}>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <Field label="Chapter label">
                      <input className={inputClass} value={draft.chapterLabel} onChange={(event) => setDraft((current) => ({ ...current, chapterLabel: event.target.value }))} />
                    </Field>
                    <Field label="Date label">
                      <input className={inputClass} value={draft.dateLabel} onChange={(event) => setDraft((current) => ({ ...current, dateLabel: event.target.value }))} />
                    </Field>
                    <Field label="Starts at">
                      <input className={dateInputClass} type="datetime-local" value={toDateTimeLocal(draft.eventStartsAt)} onChange={(event) => setDraft((current) => ({ ...current, eventStartsAt: event.target.value || null }))} />
                    </Field>
                    <Field label="Ends at">
                      <input className={dateInputClass} type="datetime-local" value={toDateTimeLocal(draft.eventEndsAt)} onChange={(event) => setDraft((current) => ({ ...current, eventEndsAt: event.target.value || null }))} />
                    </Field>
                    <Field label="Payout badge">
                      <input className={inputClass} value={draft.payoutBadgeText} onChange={(event) => setDraft((current) => ({ ...current, payoutBadgeText: event.target.value }))} />
                    </Field>
                    <Field label="Featured badge">
                      <input className={inputClass} value={draft.featuredBadgeText} onChange={(event) => setDraft((current) => ({ ...current, featuredBadgeText: event.target.value }))} />
                    </Field>
                    <Field label="CTA label">
                      <input className={inputClass} value={draft.ctaLabel} onChange={(event) => setDraft((current) => ({ ...current, ctaLabel: event.target.value }))} />
                    </Field>
                    <Field label="CTA URL" hint="Internal /path only.">
                      <input className={inputClass} value={draft.ctaUrl} onChange={(event) => setDraft((current) => ({ ...current, ctaUrl: event.target.value }))} />
                    </Field>
                    <Field label="Match format">
                      <input className={inputClass} value={draft.matchFormat} onChange={(event) => setDraft((current) => ({ ...current, matchFormat: event.target.value }))} />
                    </Field>
                    <Field label="Rules / stakes summary">
                      <input className={inputClass} value={draft.rulesSummary} onChange={(event) => setDraft((current) => ({ ...current, rulesSummary: event.target.value }))} />
                    </Field>
                    <Field label="Tournament name">
                      <input className={inputClass} value={draft.tournamentName} onChange={(event) => setDraft((current) => ({ ...current, tournamentName: event.target.value }))} />
                    </Field>
                    <Field label="Linked trophy">
                      <select className={selectClass} value={draft.linkedTrophyId || ""} onChange={(event) => setDraft((current) => ({ ...current, linkedTrophyId: Number(event.target.value) || null }))}>
                        <option value="">No linked trophy</option>
                        {snapshot.trophies.map((trophy) => (
                          <option key={trophy.id} value={trophy.id}>{trophy.displayName} · {trophy.status}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </EditorSection>

                <EditorSection title="Warriors and Commissioner" icon={Shield}>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <PersonEditor
                      label="Player One"
                      users={snapshot.users}
                      mediaAssets={snapshot.mediaAssets}
                      userId={draft.playerOneUserId}
                      name={draft.playerOneName}
                      avatarUrl={draft.playerOneAvatarUrl}
                      onUserChange={(user) => setDraft((current) => applySelectedUser(current, user, "playerOne"))}
                      onNameChange={(value) => setDraft((current) => ({ ...current, playerOneName: value }))}
                      onAvatarChange={(value) => setDraft((current) => ({ ...current, playerOneAvatarUrl: value }))}
                    />
                    <PersonEditor
                      label="Player Two"
                      users={snapshot.users}
                      mediaAssets={snapshot.mediaAssets}
                      userId={draft.playerTwoUserId}
                      name={draft.playerTwoName}
                      avatarUrl={draft.playerTwoAvatarUrl}
                      onUserChange={(user) => setDraft((current) => applySelectedUser(current, user, "playerTwo"))}
                      onNameChange={(value) => setDraft((current) => ({ ...current, playerTwoName: value }))}
                      onAvatarChange={(value) => setDraft((current) => ({ ...current, playerTwoAvatarUrl: value }))}
                    />
                    <PersonEditor
                      label="Commissioner"
                      users={snapshot.users}
                      mediaAssets={snapshot.mediaAssets}
                      userId={draft.commissionerUserId}
                      name={draft.commissionerName}
                      avatarUrl={draft.commissionerAvatarUrl}
                      onUserChange={(user) => setDraft((current) => applySelectedUser(current, user, "commissioner"))}
                      onNameChange={(value) => setDraft((current) => ({ ...current, commissionerName: value }))}
                      onAvatarChange={(value) => setDraft((current) => ({ ...current, commissionerAvatarUrl: value }))}
                    />
                  </div>
                </EditorSection>

                <EditorSection title="Stage art and theme" icon={Images}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MediaField
                      label="Championship belt / artifact image"
                      hint="Use Media Armory paths or safe https:// URLs."
                      value={draft.beltImageUrl}
                      assets={snapshot.mediaAssets}
                      kinds={["belt", "artifact", "logo", "other"]}
                      onChange={(value) => setDraft((current) => ({ ...current, beltImageUrl: value }))}
                    />
                    <MediaField
                      label="Desktop background image"
                      value={draft.backgroundImageUrl}
                      assets={snapshot.mediaAssets}
                      kinds={["background", "other"]}
                      placeholder="/uploads/managed-assets/background/..."
                      onChange={(value) => setDraft((current) => ({ ...current, backgroundImageUrl: value }))}
                    />
                    <MediaField
                      label="Mobile background image"
                      value={draft.mobileBackgroundImageUrl}
                      assets={snapshot.mediaAssets}
                      kinds={["background", "other"]}
                      placeholder="/uploads/managed-assets/background/..."
                      onChange={(value) => setDraft((current) => ({ ...current, mobileBackgroundImageUrl: value }))}
                    />
                    <Field label="Theme key">
                      <input className={inputClass} value={draft.theme} onChange={(event) => setDraft((current) => ({ ...current, theme: event.target.value }))} />
                    </Field>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    <ColorField label="Gradient from" value={draft.gradientFrom} onChange={(value) => setDraft((current) => ({ ...current, gradientFrom: value }))} />
                    <ColorField label="Gradient via" value={draft.gradientVia} onChange={(value) => setDraft((current) => ({ ...current, gradientVia: value }))} />
                    <ColorField label="Gradient to" value={draft.gradientTo} onChange={(value) => setDraft((current) => ({ ...current, gradientTo: value }))} />
                    <Field label="Overlay opacity">
                      <input className={inputClass} type="number" min="0" max="1" step="0.05" value={draft.overlayOpacity} onChange={(event) => setDraft((current) => ({ ...current, overlayOpacity: Number(event.target.value) }))} />
                    </Field>
                    <Field label="Vignette opacity">
                      <input className={inputClass} type="number" min="0" max="1" step="0.05" value={draft.vignetteOpacity} onChange={(event) => setDraft((current) => ({ ...current, vignetteOpacity: Number(event.target.value) }))} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Link href="/admin/media-assets" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-white/22 hover:text-white">
                      <Images className="h-3.5 w-3.5" />
                      Open Media Armory
                    </Link>
                  </div>
                </EditorSection>
              </div>
            </section>

            <section className="min-w-0 overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#030712] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-100/[0.65]">
                    <Eye className="h-4 w-4" />
                    Live composition preview
                  </div>
                  <p className="mt-2 text-sm text-slate-400">
                    The preview uses the same component as the public homepage and lobby.
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
              <div className={`mt-5 overflow-hidden ${previewMode === "mobile" ? "mx-auto max-w-[25rem]" : "w-full"}`}>
                <WolomaniaPromoTile eventTile={draft} previewMode={previewMode} />
              </div>
            </section>
          </main>
        </div>
      )}
    </div>
  );
}

function EditorSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Crown;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        <Icon className="h-4 w-4 text-amber-200/[0.7]" />
        {title}
      </div>
      {children}
    </section>
  );
}

function PersonEditor({
  label,
  users,
  mediaAssets,
  userId,
  name,
  avatarUrl,
  onUserChange,
  onNameChange,
  onAvatarChange,
}: {
  label: string;
  users: EventStudioUser[];
  mediaAssets: EventStudioMediaAsset[];
  userId: number | null;
  name: string;
  avatarUrl: string;
  onUserChange: (user: EventStudioUser | undefined) => void;
  onNameChange: (value: string) => void;
  onAvatarChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#050914] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/[0.65]">{label}</div>
      <div className="mt-3 space-y-3">
        <Field label="App identity">
          <select className={selectClass} value={userId || ""} onChange={(event) => onUserChange(users.find((user) => user.id === Number(event.target.value)))}>
            <option value="">Manual / unlinked</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name} · {user.representedCountry || "No country"}</option>
            ))}
          </select>
        </Field>
        <Field label="Display name">
          <input className={inputClass} value={name} onChange={(event) => onNameChange(event.target.value)} />
        </Field>
        <MediaField
          label="Avatar URL / path"
          value={avatarUrl}
          assets={mediaAssets}
          kinds={["avatar"]}
          onChange={onAvatarChange}
        />
      </div>
    </div>
  );
}

function mediaAssetSearchText(asset: EventStudioMediaAsset) {
  return [asset.label, asset.target, asset.kind, asset.url]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function mediaAssetThumbStyle(url: string) {
  const safeUrl = url.replace(/"/g, "%22");
  return { backgroundImage: `url("${safeUrl}")` };
}

function MediaField({
  label,
  hint,
  value,
  assets,
  kinds,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  assets: EventStudioMediaAsset[];
  kinds: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const kindKey = kinds.join("|");
  const normalizedQuery = query.trim().toLowerCase();

  const allChoices = useMemo(() => {
    const allowedKinds = new Set(kindKey.split("|").filter(Boolean));
    return assets
      .filter((asset) => asset.active && allowedKinds.has(asset.kind) && asset.url)
      .sort((a, b) => {
        if (a.url === value) return -1;
        if (b.url === value) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [assets, kindKey, value]);

  const choices = useMemo(() => {
    if (!normalizedQuery) return allChoices;
    return allChoices.filter((asset) => mediaAssetSearchText(asset).includes(normalizedQuery));
  }, [allChoices, normalizedQuery]);

  const selectedAsset = allChoices.find((asset) => asset.url === value);
  const countLabel = `${allChoices.length} ${allChoices.length === 1 ? "asset" : "assets"}`;

  return (
    <Field label={label} hint={hint}>
      <div className="space-y-2">
        <input
          className={inputClass}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />

        {selectedAsset ? (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200/25 bg-amber-300/[0.08] p-2">
            <div
              className="h-14 w-14 shrink-0 rounded-xl border border-amber-100/20 bg-slate-950 bg-cover bg-center"
              style={mediaAssetThumbStyle(selectedAsset.url)}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-amber-100">
                {selectedAsset.label || selectedAsset.target || selectedAsset.url}
              </div>
              <div className="mt-1 truncate text-[10px] uppercase tracking-[0.14em] text-amber-100/55">
                Selected {selectedAsset.kind}{selectedAsset.target ? ` · ${selectedAsset.target}` : ""}
              </div>
            </div>
          </div>
        ) : value ? (
          <div className="rounded-2xl border border-sky-200/15 bg-sky-400/[0.06] px-3 py-2 text-[11px] text-sky-100/75">
            Custom path entered. Pick an asset below to replace it.
          </div>
        ) : null}

        {allChoices.length > 0 ? (
          <div className="rounded-2xl border border-white/6 bg-black/10 p-2">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                className="min-h-9 flex-1 rounded-xl border border-white/[0.1] bg-[#030712] px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-200/35"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${countLabel}...`}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded-full border border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 transition hover:border-white/25 hover:text-white"
                >
                  Clear
                </button>
              ) : null}
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {choices.length}/{allChoices.length}
              </span>
            </div>

            {choices.length > 0 ? (
              <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {choices.map((asset) => {
                  const selected = value === asset.url;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onChange(asset.url)}
                      title={asset.url}
                      className={`group flex min-w-0 items-center gap-2 rounded-2xl border p-2 text-left transition ${
                        selected
                          ? "border-amber-200/55 bg-amber-300/15 text-amber-100"
                          : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-amber-200/30 hover:bg-white/[0.055] hover:text-amber-100"
                      }`}
                    >
                      <span
                        className="h-12 w-12 shrink-0 rounded-xl border border-white/10 bg-slate-950 bg-cover bg-center"
                        style={mediaAssetThumbStyle(asset.url)}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {asset.label || asset.target || asset.url}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-slate-500 group-hover:text-amber-100/65">
                          {asset.target || asset.kind}
                        </span>
                      </span>
                      {selected ? (
                        <span className="shrink-0 rounded-full border border-amber-100/30 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]">
                          Active
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-3 text-[11px] text-slate-500">
                No matching assets. Clear the search or upload one in Media Armory.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-3 py-2 text-[11px] text-slate-500">
            No active Media Armory assets for {kinds.join(", ")}.
          </div>
        )}
      </div>
    </Field>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex min-w-0 gap-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 shrink-0 rounded-lg border border-white/10 bg-[#050914] p-1 [color-scheme:dark]" />
        <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </Field>
  );
}
