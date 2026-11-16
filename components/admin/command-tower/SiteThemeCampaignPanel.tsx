"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Palette, Power, RefreshCw } from "lucide-react";
import { NOVEMBER_2026_CAMPAIGN } from "@/lib/novemberThemeCampaign";

type ThemeCampaignPayload = {
  campaign: {
    campaignKey: string;
    label: string;
    enabled: boolean;
    themeKey: string;
    startsAt: string;
    endsAt: string;
    active: boolean;
    excludedPaths: readonly string[];
    updatedAt: string;
  } | null;
  stats: {
    totalUsers: number;
    campaignDefaultCount: number;
    effectiveCampaignThemeCount: number;
    explicitOverrideCount: number;
    explicitMidnightOverrideCount: number;
    savedNonCampaignThemeCount: number;
    effectiveBreakdown: Array<{ themeKey: string; count: number }>;
  } | null;
  statsAvailability?: "restricted";
  overrides: Array<{
    userId: number;
    uid: string;
    displayName: string;
    themeKey: string;
    updatedAt: string;
  }>;
};

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : value;
}

export default function SiteThemeCampaignPanel() {
  const [data, setData] = useState<ThemeCampaignPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/admin/site-theme-campaign", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Theme control failed: ${response.status}`);
      }
      setData((await response.json()) as ThemeCampaignPayload);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Theme control unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function activateNovember() {
    try {
      setSaving(true);
      setError("");
      const response = await fetch("/api/admin/site-theme-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignKey: NOVEMBER_2026_CAMPAIGN.campaignKey }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || "November campaign activation failed.");
      }
      setData((await response.json()) as ThemeCampaignPayload);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Campaign activation failed.");
    } finally {
      setSaving(false);
    }
  }

  async function setEnabled(enabled: boolean) {
    try {
      setSaving(true);
      setError("");
      const response = await fetch("/api/admin/site-theme-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };
        throw new Error(payload.detail || `Theme update failed: ${response.status}`);
      }
      setData((await response.json()) as ThemeCampaignPayload);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Theme update failed.",
      );
    } finally {
      setSaving(false);
    }
  }

  const campaign = data?.campaign ?? null;
  const stats = data?.stats ?? null;
  const isNovember = campaign?.campaignKey === NOVEMBER_2026_CAMPAIGN.campaignKey;
  const statusLabel = !campaign
    ? "Not configured"
    : campaign.active
      ? "ACTIVE"
      : campaign.enabled
        ? "ON · outside window"
        : "OFF";

  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(145deg,rgba(8,8,10,0.96),rgba(16,16,20,0.88))] shadow-[0_26px_80px_rgba(0,0,0,0.32)]">
      <div className="border-b border-white/8 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
              <Moon className="h-4 w-4" />
              Site Display Control
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {campaign?.label || "Site Appearance Campaign"}
            </div>
            <div className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              {isNovember
                ? "November defaults the normal site shell to Ember Crimson; every player's long-term theme and explicit opt-outs remain intact."
                : "Monthly campaigns set a temporary site appearance without overwriting players' saved themes or previously recorded opt-outs."}
              {" "}Academy, Statistics, Traffic and Speed keep their own page identities.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isNovember ? (
              <button
                type="button"
                disabled={!campaign || saving}
                onClick={() => void activateNovember()}
                className="inline-flex h-10 items-center rounded-xl border border-rose-300/30 bg-rose-500/15 px-3 text-[11px] font-bold text-rose-100 transition hover:bg-rose-500/25 disabled:opacity-50"
              >
                Activate November Red
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              title="Refresh theme campaign"
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
            <button
              type="button"
              disabled={!campaign || saving}
              onClick={() => {
                if (campaign) void setEnabled(!campaign.enabled);
              }}
              className={[
                "inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-black uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-50",
                campaign?.enabled
                  ? "border-emerald-300/25 bg-emerald-400/12 text-emerald-100 hover:bg-emerald-400/18"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              <Power className="h-4 w-4" />
              {saving
                ? "Saving"
                : campaign?.enabled
                  ? (isNovember ? "November Red ON" : "October Black ON")
                  : (isNovember ? "November Red OFF" : "October Black OFF")}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
          <span
            className={[
              "rounded-full border px-3 py-1.5",
              campaign?.active
                ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                : "border-white/10 bg-white/5 text-slate-400",
            ].join(" ")}
          >
            {statusLabel}
          </span>
          {campaign ? (
            <>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-400">
                Campaign default · {campaign.themeKey}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-400">
                {shortDate(campaign.startsAt)} → {shortDate(campaign.endsAt)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-b border-red-300/10 bg-red-500/8 px-5 py-3 text-sm text-red-200 sm:px-6">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">
        <Metric label="Registered" value={stats?.totalUsers ?? null} />
        <Metric
          label={isNovember ? "Effective Crimson" : "Effective Black"}
          value={stats?.effectiveCampaignThemeCount ?? null}
          accent
        />
        <Metric
          label="Campaign Default"
          value={stats?.campaignDefaultCount ?? null}
        />
        <Metric
          label="Blue Overrides"
          value={stats?.explicitMidnightOverrideCount ?? null}
        />
        <Metric
          label="All Explicit Overrides"
          value={stats?.explicitOverrideCount ?? null}
        />
      </div>

      <div className="grid gap-4 border-t border-white/8 px-5 py-5 sm:px-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
            <Palette className="h-4 w-4" />
            Effective Theme Mix
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(stats?.effectiveBreakdown ?? []).map((entry) => (
              <div
                key={entry.themeKey}
                className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-3"
              >
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {entry.themeKey}
                </div>
                <div className="mt-1 text-xl font-semibold text-white">
                  {entry.count}
                </div>
              </div>
            ))}
          </div>
          {stats === null && data ? (
            <div className="mt-3 text-xs text-slate-500">
              Detailed player theme counts require a separately reviewed reporting reader.
            </div>
          ) : null}
          {campaign?.excludedPaths?.length ? (
            <div className="mt-4 text-xs leading-5 text-slate-500">
              Excluded self-themed routes: {campaign.excludedPaths.join(", ")}
            </div>
          ) : null}
        </div>

        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
            Campaign Opt-outs
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
            {stats === null ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-4 text-sm text-slate-500">
                Player opt-out details are unavailable to the restricted production reader.
              </div>
            ) : data?.overrides?.length ? (
              data.overrides.map((row) => (
                <div
                  key={row.userId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.035] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {row.displayName}
                    </div>
                    <div className="truncate text-[11px] text-slate-600">
                      {row.uid}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
                      {row.themeKey}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-600">
                      {shortDate(row.updatedAt)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-4 text-sm text-slate-500">
                Nobody has overridden the active campaign.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border px-4 py-4",
        accent
          ? "border-emerald-300/18 bg-emerald-400/[0.07]"
          : "border-white/8 bg-white/[0.035]",
      ].join(" ")}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${accent ? "text-emerald-100" : "text-white"}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
