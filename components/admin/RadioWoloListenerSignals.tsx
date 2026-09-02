"use client";

import {
  RadioTower,
  RefreshCw,
  Star,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

type Payload = {
  generatedAt: string;
  summary: {
    totalListeners: number;
    onCount: number;
    offCount: number;
    signedInCount: number;
    anonymousCount: number;
    totalRatings: number;
  };
  listeners: Array<{
    listenerId: string;
    identityKind:
      | "user"
      | "anonymous";
    userUid:
      | string
      | null;
    displayName: string;
    status:
      | "on"
      | "off";
    storedListening:
      boolean;
    lastEvent: string;
    lastSeenAt: string;
    startedListeningAt:
      | string
      | null;
    stoppedListeningAt:
      | string
      | null;
    currentTrack:
      | string
      | null;
    currentRating:
      | number
      | null;
  }>;
  tracks: Array<{
    assetId: number;
    title: string;
    ratingCount: number;
    averageRating:
      | number
      | null;
    lastRatedAt:
      | string
      | null;
    distribution: number[];
  }>;
};

function shortTime(
  value: string,
) {
  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime(),
    )
  ) {
    return "unknown";
  }

  return date.toLocaleString(
    [],
    {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  );
}

function SummaryCard(
  props: {
    label: string;
    value: number;
    detail: string;
  },
) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
        {props.label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {props.value}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        {props.detail}
      </div>
    </div>
  );
}

export function RadioWoloListenerSignals() {
  const [
    data,
    setData,
  ] =
    useState<Payload | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const refresh =
    useCallback(
      async () => {
        setRefreshing(
          true,
        );

        try {
          const response =
            await fetch(
              "/api/admin/radio/listeners",
              {
                credentials:
                  "same-origin",
                cache:
                  "no-store",
              },
            );

          if (!response.ok) {
            throw new Error(
              `Radio listener analytics returned ${response.status}.`,
            );
          }

          setData(
            (await response.json()) as
              Payload,
          );

          setError(null);
        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Radio listener analytics unavailable.",
          );
        } finally {
          setRefreshing(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    void refresh();

    const timer =
      window.setInterval(
        () => {
          void refresh();
        },
        15_000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [refresh]);

  return (
    <section className="rounded-[1.5rem] border border-amber-200/12 bg-[radial-gradient(circle_at_10%_0%,rgba(245,158,11,0.10),transparent_34%),linear-gradient(135deg,rgba(2,6,23,0.92),rgba(7,20,40,0.76))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/60">
            <RadioTower className="h-4 w-4" />
            Radio WOLO Listener Signals
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            Who is listening, who turned it off, and what they rate
          </div>
          <div className="mt-1 text-sm text-slate-400">
            Signed-in Kingdom members and random anonymous browser listeners. No fingerprinting.
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            void refresh()
          }
          disabled={
            refreshing
          }
          className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300 transition hover:border-amber-200/30 hover:text-amber-100 disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              refreshing
                ? "animate-spin"
                : ""
            }`}
          />
          Refresh
        </button>
      </div>

      {data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard
              label="Known listeners"
              value={
                data.summary
                  .totalListeners
              }
              detail="Browsers that entered Radio WOLO"
            />
            <SummaryCard
              label="ON"
              value={
                data.summary
                  .onCount
              }
              detail="Fresh listening heartbeat"
            />
            <SummaryCard
              label="OFF"
              value={
                data.summary
                  .offCount
              }
              detail="Sound off or heartbeat expired"
            />
            <SummaryCard
              label="Members"
              value={
                data.summary
                  .signedInCount
              }
              detail="Resolved signed-in identities"
            />
            <SummaryCard
              label="Anonymous"
              value={
                data.summary
                  .anonymousCount
              }
              detail="Random browser identities"
            />
            <SummaryCard
              label="Ratings"
              value={
                data.summary
                  .totalRatings
              }
              detail="Current durable song ratings"
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/8 bg-slate-950/55">
            <div className="grid grid-cols-[minmax(10rem,1.05fr)_5rem_minmax(12rem,1.4fr)_5rem_8rem] gap-3 border-b border-white/8 px-4 py-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
              <span>Listener</span>
              <span>Sound</span>
              <span>Last track</span>
              <span>Rating</span>
              <span>Signal</span>
            </div>

            {data.listeners.length > 0 ? (
              data.listeners
                .slice(
                  0,
                  30,
                )
                .map(
                  (
                    row,
                  ) => (
                    <div
                      key={
                        row.listenerId
                      }
                      className="grid grid-cols-[minmax(10rem,1.05fr)_5rem_minmax(12rem,1.4fr)_5rem_8rem] gap-3 border-b border-white/[0.05] px-4 py-3 text-xs last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {row.identityKind === "user" ? (
                            <UserRound className="h-3.5 w-3.5 shrink-0 text-amber-200/55" />
                          ) : (
                            <UsersRound className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          )}
                          <span className="truncate font-semibold text-white">
                            {
                              row.displayName
                            }
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[10px] text-slate-600">
                          {row.identityKind === "user"
                            ? row.userUid
                            : row.listenerId.slice(
                                0,
                                8,
                              )}
                        </div>
                      </div>

                      <div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                            row.status === "on"
                              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
                              : "border-white/10 bg-white/5 text-slate-400"
                          }`}
                        >
                          {row.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="min-w-0 truncate text-slate-300">
                        {row.currentTrack ||
                          "—"}
                      </div>

                      <div className="font-semibold text-amber-100">
                        {row.currentRating
                          ? `${row.currentRating}/10`
                          : "—"}
                      </div>

                      <div>
                        <div className="text-slate-400">
                          {row.lastEvent}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {shortTime(
                            row.lastSeenAt,
                          )}
                        </div>
                      </div>
                    </div>
                  ),
                )
            ) : (
              <div className="px-4 py-5 text-sm text-slate-500">
                No Radio WOLO listener signals yet.
              </div>
            )}
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              <Star className="h-3.5 w-3.5" />
              Track ratings
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {data.tracks.length > 0 ? (
                data.tracks
                  .slice(
                    0,
                    12,
                  )
                  .map(
                    (
                      track,
                    ) => (
                      <div
                        key={
                          track.assetId
                        }
                        className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-white">
                              {
                                track.title
                              }
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {track.ratingCount} rating
                              {track.ratingCount === 1
                                ? ""
                                : "s"}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-xl font-semibold text-amber-100">
                              {track.averageRating === null
                                ? "—"
                                : `${track.averageRating}/10`}
                            </div>
                            <div className="text-[9px] uppercase tracking-[0.16em] text-slate-600">
                              average
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-10 gap-1">
                          {track.distribution.map(
                            (
                              count,
                              index,
                            ) => (
                              <div
                                key={
                                  index
                                }
                                className="text-center"
                              >
                                <div className="text-[9px] text-slate-600">
                                  {index + 1}
                                </div>
                                <div className="mt-1 rounded bg-amber-300/[0.08] py-1 text-[10px] text-amber-100/70">
                                  {count}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    ),
                  )
              ) : (
                <div className="rounded-2xl border border-white/8 bg-slate-950/55 px-4 py-5 text-sm text-slate-500">
                  No song ratings yet.
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-300/15 bg-rose-400/[0.06] px-3 py-2 text-xs text-rose-100/70">
          {error}
        </div>
      ) : null}
    </section>
  );
}
