"use client";

/* eslint-disable @next/next/no-img-element -- managed clan crest URLs are runtime assets */

import {
  Check,
  Crown,
  Layers3,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  CLAN_CHAT_VIEWS,
  type ClanChatViewMode,
} from "@/components/clans/clanChatViewPreference";

type CrestOption = {
  id: number;
  label: string;
  url: string;
  alt: string | null;
  selected: boolean;
};

type ManagedClan = {
  id: number;
  slug: string;
  name: string;
  crestUrl: string | null;
  defaultChatView: ClanChatViewMode;
  options: CrestOption[];
};

export default function ClanCrestManager() {
  const [clans, setClans] = useState<ManagedClan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        "/api/user/clan-crests",
        {
          cache: "no-store",
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        clans?: ManagedClan[];
        detail?: string;
      };

      if (response.status === 401) {
        setClans([]);
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload.detail ||
            "Could not load clan crests.",
        );
      }

      setClans(
        Array.isArray(payload.clans)
          ? payload.clans
          : [],
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load clan crests.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function selectCrest(
    clan: ManagedClan,
    option: CrestOption,
  ) {
    const key = `${clan.id}:${option.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/user/clan-crests",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clanId: clan.id,
            assetId: option.id,
          }),
        },
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as {
        clans?: ManagedClan[];
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.detail ||
            "Could not select clan crest.",
        );
      }

      if (Array.isArray(payload.clans)) {
        setClans(payload.clans);
      } else {
        await load();
      }

      setNotice(
        `${clan.name} now flies ${option.label}.`,
      );
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : "Could not select clan crest.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function setDefaultChatView(
    clan: ManagedClan,
    defaultChatView: ClanChatViewMode,
  ) {
    if (defaultChatView === clan.defaultChatView) return;

    const key = `view:${clan.id}`;
    setBusyKey(key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/user/clan-crests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_default_chat_view",
          clanId: clan.id,
          defaultChatView,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        clans?: ManagedClan[];
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not set the Hall default view.");
      }

      if (Array.isArray(payload.clans)) setClans(payload.clans);
      else await load();

      setNotice(`${clan.name} Hall default set to ${defaultChatView.toUpperCase()}.`);
    } catch (viewError) {
      setError(
        viewError instanceof Error
          ? viewError.message
          : "Could not set the Hall default view.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  if (!loading && clans.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-red-200/14 bg-[radial-gradient(circle_at_12%_0%,rgba(153,27,27,0.16),transparent_34%),linear-gradient(145deg,rgba(20,12,10,0.95),rgba(4,6,9,0.98))] p-5 text-white shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-red-100/65">
            <Crown className="h-4 w-4 text-amber-200" />
            Clan administration
          </div>
          <h2 className="mt-2 font-serif text-2xl sm:text-3xl">
            Choose your clan crest
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
            AoE2WAR assigns crest options to your house. The King
            and clan admins can change the banner displayed across the
            directory and hall whenever they choose.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-stone-300 transition hover:border-amber-200/25 hover:text-amber-100 disabled:opacity-45"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-5 h-36 animate-pulse rounded-[1.4rem] border border-white/8 bg-white/[0.03]" />
      ) : (
        <div className="mt-6 grid gap-5">
          {clans.map((clan) => (
            <div
              key={clan.id}
              className="rounded-[1.5rem] border border-white/9 bg-black/25 p-4"
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-200" />
                <div className="font-semibold">
                  {clan.name}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/7 bg-white/[0.02] px-3 py-2">
                <Layers3 className="h-3.5 w-3.5 text-amber-100/65" aria-hidden="true" />
                <span className="text-[9px] font-black uppercase tracking-[0.18em] text-stone-500">
                  Hall default
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {CLAN_CHAT_VIEWS.map((view) => {
                    const selected = clan.defaultChatView === view.key;
                    const busy = busyKey === `view:${clan.id}`;
                    return (
                      <button
                        key={`${clan.id}-view-${view.key}`}
                        type="button"
                        onClick={() => void setDefaultChatView(clan, view.key)}
                        disabled={busy}
                        aria-pressed={selected}
                        aria-label={`${clan.name} default ${view.version} ${view.label}`}
                        title={`${view.version} · ${view.label}`}
                        className={`grid h-7 min-w-7 place-items-center rounded-md border px-1.5 text-[9px] font-black transition ${
                          selected
                            ? "border-amber-200/30 bg-amber-300/12 text-amber-100"
                            : "border-transparent bg-white/[0.03] text-stone-500 hover:border-white/10 hover:text-stone-200"
                        } disabled:opacity-45`}
                      >
                        {view.version}
                      </button>
                    );
                  })}
                </div>
              </div>

              {clan.options.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-stone-500">
                  Emaren has not assigned crest options to this clan
                  yet.
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {clan.options.map((option) => {
                    const busy =
                      busyKey ===
                      `${clan.id}:${option.id}`;

                    return (
                      <button
                        key={`${clan.id}-${option.id}`}
                        type="button"
                        onClick={() =>
                          void selectCrest(
                            clan,
                            option,
                          )
                        }
                        disabled={busy}
                        className={`group relative cursor-pointer overflow-hidden rounded-[1.1rem] border p-2 text-left transition ${
                          option.selected
                            ? "border-amber-200/45 bg-amber-300/[0.08] shadow-[0_0_30px_rgba(251,191,36,0.10)]"
                            : "border-white/9 bg-white/[0.025] hover:border-red-200/25 hover:bg-red-300/[0.05]"
                        } disabled:opacity-50`}
                      >
                        <div className="relative aspect-square overflow-hidden rounded-[0.85rem] bg-black/40">
                          <img
                            src={option.url}
                            alt={
                              option.alt ||
                              option.label
                            }
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                          />
                          {option.selected ? (
                            <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-amber-300 text-stone-950">
                              <Check className="h-4 w-4" />
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4 text-stone-300">
                          {busy
                            ? "Raising…"
                            : option.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {notice ? (
        <div className="mt-5 rounded-xl border border-emerald-300/16 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-rose-300/16 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </section>
  );
}
