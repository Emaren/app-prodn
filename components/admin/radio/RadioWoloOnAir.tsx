"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Clock3,
  ListMusic,
  Loader2,
  Radio,
  RefreshCw,
  Signal,
  Square,
} from "lucide-react";

type ProgramSummary = {
  id: number;
  publicId: string;
  name: string;
  targetDurationMs: number;
  builtDurationMs: number;
  itemCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ClockAsset = {
  id: number;
  publicId: string;
  title: string;
  credit: string | null;
  kind: string;
  durationMs: number;
};

type ClockItem = {
  position: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  transition: string;
  crossfadeMs: number;
  overlapMs: number;
  offsetMs?: number;
  remainingMs?: number;
  asset: ClockAsset;
};

type StationStatus = {
  state:
    | "on_air"
    | "off_air";
  startedAt: string | null;
  stoppedAt: string | null;
  endedNaturally: boolean;
  program: {
    id: number;
    publicId: string;
    name: string;
    targetDurationMs: number;
    status: string;
    itemCount: number;
  } | null;
  clock: {
    now: string;
    elapsedMs: number;
    durationMs: number;
    remainingMs: number;
    current: ClockItem | null;
    next: ClockItem | null;
  } | null;
};

function formatClock(
  durationMs: number,
) {
  const totalSeconds =
    Math.max(
      0,
      Math.floor(
        durationMs / 1000,
      ),
    );

  const hours =
    Math.floor(
      totalSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (totalSeconds % 3600) /
        60,
    );

  const seconds =
    totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(
      minutes,
    ).padStart(
      2,
      "0",
    )}:${String(
      seconds,
    ).padStart(
      2,
      "0",
    )}`;
  }

  return `${Math.floor(
    totalSeconds / 60,
  )}:${String(
    seconds,
  ).padStart(
    2,
    "0",
  )}`;
}

function formatLocalTime(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "—";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour:
        "numeric",
      minute:
        "2-digit",
      second:
        "2-digit",
    },
  );
}

function percent(
  elapsedMs: number,
  durationMs: number,
) {
  if (
    durationMs <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      (elapsedMs /
        durationMs) *
        100,
    ),
  );
}

export default function RadioWoloOnAir() {
  const [
    programs,
    setPrograms,
  ] = useState<
    ProgramSummary[]
  >([]);

  const [
    station,
    setStation,
  ] = useState<
    StationStatus | null
  >(null);

  const [
    selectedProgramId,
    setSelectedProgramId,
  ] = useState<
    number | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    notice,
    setNotice,
  ] = useState<
    string | null
  >(null);

  const [
    syncAt,
    setSyncAt,
  ] = useState(
    Date.now(),
  );

  const [
    tick,
    setTick,
  ] = useState(
    Date.now(),
  );

  const fetchJson =
    useCallback(
      async (
        url: string,
        options?: RequestInit,
      ) => {
        const response =
          await fetch(
            url,
            options,
          );

        const payload =
          (await response
            .json()
            .catch(
              () => ({}),
            )) as Record<
            string,
            unknown
          >;

        if (
          !response.ok
        ) {
          throw new Error(
            typeof payload.detail ===
              "string"
              ? payload.detail
              : "Radio WOLO transmitter request failed.",
          );
        }

        return payload;
      },
      [],
    );

  const loadPrograms =
    useCallback(
      async () => {
        const payload =
          await fetchJson(
            "/api/admin/radio/programs",
            {
              cache:
                "no-store",
            },
          );

        setPrograms(
          (payload.programs ||
            []) as ProgramSummary[],
        );
      },
      [fetchJson],
    );

  const refreshStation =
    useCallback(
      async () => {
        try {
          const payload =
            await fetchJson(
              "/api/admin/radio/station",
              {
                cache:
                  "no-store",
              },
            );

          setStation(
            payload.station as
              StationStatus,
          );

          setSyncAt(
            Date.now(),
          );

          setTick(
            Date.now(),
          );
        } catch (
          cause
        ) {
          setError(
            cause instanceof
              Error
              ? cause.message
              : "Could not read the Radio WOLO transmitter.",
          );
        }
      },
      [fetchJson],
    );

  const refreshAll =
    useCallback(
      async () => {
        await Promise.all(
          [
            loadPrograms(),
            refreshStation(),
          ],
        );
      },
      [
        loadPrograms,
        refreshStation,
      ],
    );

  useEffect(
    () => {
      void (async () => {
        setLoading(true);

        try {
          await refreshAll();
        } finally {
          setLoading(false);
        }
      })();
    },
    [refreshAll],
  );

  useEffect(
    () => {
      const stationTimer =
        window.setInterval(
          () => {
            void refreshStation();
          },
          1500,
        );

      const clockTimer =
        window.setInterval(
          () => {
            setTick(
              Date.now(),
            );
          },
          250,
        );

      return () => {
        window.clearInterval(
          stationTimer,
        );

        window.clearInterval(
          clockTimer,
        );
      };
    },
    [refreshStation],
  );

  const readyPrograms =
    useMemo(
      () =>
        programs.filter(
          (program) =>
            program.status ===
              "ready" &&
            program.itemCount >
              0,
        ),
      [programs],
    );

  const stationProgramId =
    station?.program?.id ??
    null;

  useEffect(
    () => {
      if (
        station?.state ===
          "on_air" &&
        stationProgramId !==
          null
      ) {
        setSelectedProgramId(
          stationProgramId,
        );

        return;
      }

      if (
        selectedProgramId !==
          null &&
        readyPrograms.some(
          (program) =>
            program.id ===
            selectedProgramId,
        )
      ) {
        return;
      }

      const previousProgramId =
        stationProgramId;

      const preferred =
        previousProgramId &&
        readyPrograms.some(
          (program) =>
            program.id ===
            previousProgramId,
        )
          ? previousProgramId
          : readyPrograms[0]
              ?.id ??
            null;

      setSelectedProgramId(
        preferred,
      );
    },
    [
      readyPrograms,
      selectedProgramId,
      stationProgramId,
      station?.state,
    ],
  );

  const onAir =
    station?.state ===
    "on_air";

  const liveDeltaMs =
    onAir &&
    station?.clock
      ? Math.max(
          0,
          tick -
            syncAt,
        )
      : 0;

  const programElapsedMs =
    station?.clock
      ? Math.min(
          station.clock
            .durationMs,
          station.clock
            .elapsedMs +
            liveDeltaMs,
        )
      : 0;

  const programRemainingMs =
    station?.clock
      ? Math.max(
          0,
          station.clock
            .durationMs -
            programElapsedMs,
        )
      : 0;

  const current =
    station?.clock?.current ??
    null;

  const next =
    station?.clock?.next ??
    null;

  const currentOffsetMs =
    current
      ? Math.min(
          current.durationMs,
          Math.max(
            0,
            (current.offsetMs ??
              0) +
              liveDeltaMs,
          ),
        )
      : 0;

  const currentRemainingMs =
    current
      ? Math.max(
          0,
          current.durationMs -
            currentOffsetMs,
        )
      : 0;

  async function goOnAir() {
    if (
      selectedProgramId ===
      null
    ) {
      setError(
        "Choose a READY program first.",
      );

      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const payload =
        await fetchJson(
          "/api/admin/radio/station/start",
          {
            method:
              "POST",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  programId:
                    selectedProgramId,
                },
              ),
          },
        );

      const started =
        payload.station as {
          programName?:
            string;
        };

      setNotice(
        `${
          started.programName ||
          "Program"
        } is on air.`,
      );

      await refreshAll();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not launch Radio WOLO.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function stopTransmission() {
    if (
      !window.confirm(
        "Stop the current Radio WOLO transmission?",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(
        "/api/admin/radio/station/stop",
        {
          method:
            "POST",
        },
      );

      setNotice(
        "Radio WOLO is off air.",
      );

      await refreshAll();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not stop Radio WOLO.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-[1.8rem] border border-white/8 bg-slate-950/55 text-slate-500">
        <Loader2
          size={18}
          className="mr-2 animate-spin"
        />
        Opening the transmitter…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      <section
        className={[
          "relative overflow-hidden rounded-[1.9rem] border p-5 transition sm:p-7",
          onAir
            ? "border-rose-300/20 bg-[radial-gradient(circle_at_12%_0%,rgba(244,63,94,0.16),transparent_35%),linear-gradient(145deg,rgba(40,8,18,0.94),rgba(2,6,23,0.92))] shadow-[0_0_80px_rgba(244,63,94,0.06)]"
            : "border-white/8 bg-[radial-gradient(circle_at_12%_0%,rgba(217,70,239,0.08),transparent_38%),rgba(2,6,23,0.72)]",
        ].join(
          " ",
        )}
      >
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div
              className={[
                "flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.32em]",
                onAir
                  ? "text-rose-200"
                  : "text-slate-600",
              ].join(
                " ",
              )}
            >
              <span
                className={[
                  "h-2 w-2 rounded-full",
                  onAir
                    ? "animate-pulse bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.75)]"
                    : "bg-slate-700",
                ].join(
                  " ",
                )}
              />

              {onAir
                ? "On Air"
                : "Off Air"}
            </div>

            <h2 className="mt-3 font-serif text-4xl text-white">
              {onAir
                ? station?.program
                    ?.name
                : "The transmitter is standing by."}
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              {onAir
                ? "The station clock is authoritative. Every listener joins this same broadcast position."
                : "Choose an approved program and launch the automated Radio WOLO broadcast."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void refreshAll()
              }
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-white/[0.025] text-slate-500 transition hover:text-white"
              title="Refresh transmitter"
            >
              <RefreshCw
                size={15}
              />
            </button>

            <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2 text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.22em] text-slate-700">
                Live Host
              </div>

              <div className="mt-0.5 text-xs text-slate-600">
                GO LIVE · future
              </div>
            </div>
          </div>
        </div>
      </section>

      {!onAir ? (
        <section className="rounded-[1.7rem] border border-white/8 bg-slate-950/65 p-5 sm:p-6">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
            <div>
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.26em] text-slate-600">
                  Ready Program
                </span>

                <select
                  value={
                    selectedProgramId ??
                    ""
                  }
                  onChange={(
                    event,
                  ) =>
                    setSelectedProgramId(
                      event.target
                        .value
                        ? Number(
                            event
                              .target
                              .value,
                          )
                        : null,
                    )
                  }
                  className="w-full rounded-xl border border-white/8 bg-[#07111f] px-4 py-3 text-sm text-slate-200 outline-none focus:border-fuchsia-100/25"
                >
                  {!readyPrograms.length ? (
                    <option value="">
                      No READY programs
                    </option>
                  ) : null}

                  {readyPrograms.map(
                    (program) => (
                      <option
                        key={
                          program.id
                        }
                        value={
                          program.id
                        }
                      >
                        {
                          program.name
                        }{" "}
                        ·{" "}
                        {program.itemCount}{" "}
                        items ·{" "}
                        {formatClock(
                          program.builtDurationMs,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                <ListMusic
                  size={13}
                />

                {readyPrograms.length
                  ? `${readyPrograms.length} approved ${
                      readyPrograms.length ===
                      1
                        ? "program"
                        : "programs"
                    } available`
                  : "Build a chain and Mark ready before transmitting."}
              </div>
            </div>

            <button
              type="button"
              disabled={
                busy ||
                selectedProgramId ===
                  null
              }
              onClick={() =>
                void goOnAir()
              }
              className="group inline-flex min-h-16 items-center justify-center gap-3 rounded-2xl border border-rose-200/20 bg-rose-500 px-8 text-sm font-black uppercase tracking-[0.22em] text-white shadow-[0_14px_45px_rgba(244,63,94,0.20)] transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {busy ? (
                <Loader2
                  size={18}
                  className="animate-spin"
                />
              ) : (
                <Radio
                  size={18}
                />
              )}

              Go On Air
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <StationClockCard
              label="Elapsed"
              value={formatClock(
                programElapsedMs,
              )}
            />

            <StationClockCard
              label="Remaining"
              value={formatClock(
                programRemainingMs,
              )}
            />

            <StationClockCard
              label="Started"
              value={formatLocalTime(
                station?.startedAt ??
                  null,
              )}
            />
          </section>

          <section className="overflow-hidden rounded-[1.8rem] border border-rose-200/15 bg-[linear-gradient(145deg,rgba(26,8,17,0.90),rgba(2,6,23,0.94))]">
            <div className="border-b border-white/[0.06] p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-rose-200/70">
                    <Signal
                      size={13}
                    />
                    Transmission Clock
                  </div>

                  <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-white">
                    {formatClock(
                      programElapsedMs,
                    )}
                    <span className="mx-2 text-slate-700">
                      /
                    </span>
                    <span className="text-slate-500">
                      {formatClock(
                        station
                          ?.clock
                          ?.durationMs ??
                          0,
                      )}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600">
                  {station?.program
                    ?.itemCount ??
                    0}{" "}
                  broadcast items
                </div>
              </div>

              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                <div
                  className="h-full rounded-full bg-rose-400 transition-[width] duration-300"
                  style={{
                    width: `${percent(
                      programElapsedMs,
                      station
                        ?.clock
                        ?.durationMs ??
                        0,
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="grid gap-px bg-white/[0.055] lg:grid-cols-[1.3fr_.7fr]">
              <div className="bg-[#060812] p-5 sm:p-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-rose-200/60">
                  Now
                </div>

                {current ? (
                  <>
                    <div className="mt-3 text-2xl font-semibold text-white">
                      {
                        current.asset
                          .title
                      }
                    </div>

                    <div className="mt-1 text-sm text-fuchsia-100/65">
                      {current.asset
                        .credit ||
                        current.asset
                          .kind}
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <MiniMetric
                        label="Position"
                        value={`${current.position + 1}/${station?.program?.itemCount ?? 0}`}
                      />

                      <MiniMetric
                        label="Into Track"
                        value={formatClock(
                          currentOffsetMs,
                        )}
                      />

                      <MiniMetric
                        label="Track Left"
                        value={formatClock(
                          currentRemainingMs,
                        )}
                      />
                    </div>

                    <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-fuchsia-200/75 transition-[width] duration-300"
                        style={{
                          width: `${percent(
                            currentOffsetMs,
                            current.durationMs,
                          )}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-4 text-sm text-slate-600">
                    Waiting for the
                    station clock…
                  </div>
                )}
              </div>

              <div className="bg-[#050711] p-5 sm:p-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600">
                  Next
                </div>

                {next ? (
                  <>
                    <div className="mt-3 text-lg font-semibold text-slate-200">
                      {
                        next.asset
                          .title
                      }
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      {next.asset
                        .credit ||
                        next.asset
                          .kind}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span>
                        {formatClock(
                          next.durationMs,
                        )}
                      </span>

                      <span>·</span>

                      <span className="capitalize">
                        {
                          next.transition
                        }
                      </span>

                      {next.transition ===
                      "crossfade" ? (
                        <>
                          <span>·</span>
                          <span>
                            {
                              next.crossfadeMs
                            }{" "}
                            ms
                          </span>
                        </>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 text-sm text-slate-600">
                    Final item in the
                    program.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[1.5rem] border border-white/8 bg-slate-950/65 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                Authority
              </div>

              <div className="mt-1 text-sm text-slate-400">
                This program is frozen
                while its station clock
                is active.
              </div>
            </div>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={() =>
                void stopTransmission()
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/10 px-5 py-3 text-xs font-bold uppercase tracking-[0.16em] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-40"
            >
              {busy ? (
                <Loader2
                  size={15}
                  className="animate-spin"
                />
              ) : (
                <Square
                  size={13}
                  fill="currentColor"
                />
              )}

              Stop Transmission
            </button>
          </section>
        </>
      )}
    </div>
  );
}

function StationClockCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-slate-950/65 px-5 py-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
        <Clock3
          size={12}
        />
        {label}
      </div>

      <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-100">
        {value}
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-700">
        {label}
      </div>

      <div className="mt-1 font-mono text-sm tabular-nums text-slate-300">
        {value}
      </div>
    </div>
  );
}
