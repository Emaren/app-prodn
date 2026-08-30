"use client";

import {
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Clock3,
  GripVertical,
  ListMusic,
  Loader2,
  Plus,
  Radio,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import {
  calculateRadioProgramDurationMs,
} from "@/lib/radioWoloPrograms";

type Asset = {
  id: number;
  publicId?: string;
  title: string;
  credit: string | null;
  kind: string;
  tags: string[];
  durationMs: number;
  status: string;
};

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

type ProgramDetail = {
  id: number;
  publicId: string;
  name: string;
  targetDurationMs: number;
  builtDurationMs: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: number;
    position: number;
    transition: string;
    crossfadeMs: number;
    asset: Asset;
  }>;
};

type Transition =
  | "cut"
  | "crossfade"
  | "bumper";

type ChainItem = {
  key: string;
  asset: Asset;
  transition: Transition;
  crossfadeMs: number;
};

function formatClock(
  durationMs: number,
) {
  const totalSeconds =
    Math.max(
      0,
      Math.round(
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

  const totalMinutes =
    Math.floor(
      totalSeconds / 60,
    );

  return `${totalMinutes}:${String(
    seconds,
  ).padStart(
    2,
    "0",
  )}`;
}

function chainKey(
  prefix: string,
) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function RadioWoloBuilder() {
  const [
    programs,
    setPrograms,
  ] = useState<
    ProgramSummary[]
  >([]);

  const [
    program,
    setProgram,
  ] = useState<
    ProgramDetail | null
  >(null);

  const [
    chain,
    setChain,
  ] = useState<
    ChainItem[]
  >([]);

  const [
    assets,
    setAssets,
  ] = useState<
    Asset[]
  >([]);

  const [
    assetSearch,
    setAssetSearch,
  ] = useState("");

  const [
    newName,
    setNewName,
  ] = useState(
    "New Broadcast Hour",
  );

  const [
    newTargetMinutes,
    setNewTargetMinutes,
  ] = useState(60);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    chainDirty,
    setChainDirty,
  ] = useState(false);

  const [
    metadataDirty,
    setMetadataDirty,
  ] = useState(false);

  const [
    draggedIndex,
    setDraggedIndex,
  ] = useState<
    number | null
  >(null);

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
              : "Radio WOLO request failed.",
          );
        }

        return payload;
      },
      [],
    );

  const loadAssets =
    useCallback(
      async () => {
        const payload =
          await fetchJson(
            "/api/admin/radio/assets",
            {
              cache:
                "no-store",
            },
          );

        setAssets(
          (payload.assets ||
            []) as Asset[],
        );
      },
      [fetchJson],
    );

  const loadProgram =
    useCallback(
      async (
        id: number,
      ) => {
        const payload =
          await fetchJson(
            `/api/admin/radio/programs/${id}`,
            {
              cache:
                "no-store",
            },
          );

        const next =
          payload.program as
            ProgramDetail;

        setProgram(next);

        setChain(
          next.items.map(
            (
              item,
              index,
            ) => ({
              key:
                `saved-${item.id}-${index}`,
              asset:
                item.asset,
              transition:
                item.transition as Transition,
              crossfadeMs:
                item.crossfadeMs,
            }),
          ),
        );

        setChainDirty(
          false,
        );

        setMetadataDirty(
          false,
        );
      },
      [fetchJson],
    );

  const loadPrograms =
    useCallback(
      async (
        preferredId?: number,
      ) => {
        const payload =
          await fetchJson(
            "/api/admin/radio/programs",
            {
              cache:
                "no-store",
            },
          );

        const next =
          (payload.programs ||
            []) as ProgramSummary[];

        setPrograms(next);

        const selectedId =
          preferredId ??
          program?.id ??
          next[0]?.id;

        if (selectedId) {
          await loadProgram(
            selectedId,
          );
        } else {
          setProgram(
            null,
          );

          setChain([]);
        }
      },
      [
        fetchJson,
        loadProgram,
        program?.id,
      ],
    );

  useEffect(
    () => {
      void (async () => {
        setLoading(true);

        try {
          await Promise.all(
            [
              loadAssets(),
              loadPrograms(),
            ],
          );
        } catch (
          cause
        ) {
          setError(
            cause instanceof
              Error
              ? cause.message
              : "Could not open the Radio WOLO builder.",
          );
        } finally {
          setLoading(false);
        }
      })();
    },
    [
      loadAssets,
      loadPrograms,
    ],
  );

  const builtDurationMs =
    useMemo(
      () =>
        calculateRadioProgramDurationMs(
          chain.map(
            (item) => ({
              durationMs:
                item.asset
                  .durationMs,
              transition:
                item.transition,
              crossfadeMs:
                item.crossfadeMs,
            }),
          ),
        ),
      [chain],
    );

  const targetDurationMs =
    program?.targetDurationMs ??
    0;

  const deltaMs =
    targetDurationMs -
    builtDurationMs;

  const visibleAssets =
    useMemo(
      () => {
        const query =
          assetSearch
            .trim()
            .toLowerCase();

        if (!query) {
          return assets;
        }

        return assets.filter(
          (asset) =>
            [
              asset.title,
              asset.credit ||
                "",
              asset.kind,
              ...asset.tags,
            ]
              .join(" ")
              .toLowerCase()
              .includes(
                query,
              ),
        );
      },
      [
        assetSearch,
        assets,
      ],
    );

  function updateChain(
    next:
      | ChainItem[]
      | ((
          current:
            ChainItem[],
        ) => ChainItem[]),
  ) {
    setChain(
      next,
    );

    setChainDirty(
      true,
    );

    if (
      program?.status ===
      "ready"
    ) {
      setProgram(
        (current) =>
          current
            ? {
                ...current,
                status:
                  "draft",
              }
            : current,
      );
    }
  }

  function addAsset(
    asset: Asset,
  ) {
    updateChain(
      (
        current,
      ) => [
        ...current,
        {
          key:
            chainKey(
              `asset-${asset.id}`,
            ),
          asset,
          transition:
            current.length
              ? "cut"
              : "cut",
          crossfadeMs:
            0,
        },
      ],
    );
  }

  function removeItem(
    index: number,
  ) {
    updateChain(
      (current) =>
        current.filter(
          (
            _,
            itemIndex,
          ) =>
            itemIndex !==
            index,
        ),
    );
  }

  function moveItem(
    from: number,
    to: number,
  ) {
    if (
      from === to ||
      to < 0 ||
      to >=
        chain.length
    ) {
      return;
    }

    updateChain(
      (current) => {
        const next = [
          ...current,
        ];

        const [
          moved,
        ] =
          next.splice(
            from,
            1,
          );

        next.splice(
          to,
          0,
          moved,
        );

        return next;
      },
    );
  }

  function onDrop(
    event:
      DragEvent<HTMLDivElement>,
    targetIndex: number,
  ) {
    event.preventDefault();

    if (
      draggedIndex ===
      null
    ) {
      return;
    }

    moveItem(
      draggedIndex,
      targetIndex,
    );

    setDraggedIndex(
      null,
    );
  }

  async function createProgram() {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const payload =
        await fetchJson(
          "/api/admin/radio/programs",
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
                  name:
                    newName,
                  targetDurationMs:
                    Math.round(
                      newTargetMinutes *
                        60_000,
                    ),
                },
              ),
          },
        );

      const created =
        payload.program as
          ProgramSummary;

      setNotice(
        `${created.name} created.`,
      );

      await loadPrograms(
        created.id,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not create the program.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata() {
    if (!program) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(
        `/api/admin/radio/programs/${program.id}`,
        {
          method:
            "PATCH",
          headers: {
            "content-type":
              "application/json",
          },
          body:
            JSON.stringify(
              {
                name:
                  program.name,
                targetDurationMs:
                  program.targetDurationMs,
              },
            ),
        },
      );

      setMetadataDirty(
        false,
      );

      setNotice(
        "Program settings saved.",
      );

      await loadPrograms(
        program.id,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not save program settings.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveChain(
    markReady = false,
  ) {
    if (!program) {
      return;
    }

    if (
      markReady &&
      chain.length === 0
    ) {
      setError(
        "Add at least one asset before marking a program ready.",
      );

      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(
        `/api/admin/radio/programs/${program.id}/items`,
        {
          method:
            "PUT",
          headers: {
            "content-type":
              "application/json",
          },
          body:
            JSON.stringify(
              {
                items:
                  chain.map(
                    (item) => ({
                      assetId:
                        item.asset
                          .id,
                      transition:
                        item.transition,
                      crossfadeMs:
                        item.transition ===
                        "crossfade"
                          ? item.crossfadeMs
                          : 0,
                    }),
                  ),
              },
            ),
        },
      );

      if (
        markReady
      ) {
        await fetchJson(
          `/api/admin/radio/programs/${program.id}`,
          {
            method:
              "PATCH",
            headers: {
              "content-type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  status:
                    "ready",
                },
              ),
          },
        );
      }

      setNotice(
        markReady
          ? "Program approved for broadcast."
          : "Broadcast chain saved.",
      );

      await loadPrograms(
        program.id,
      );
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not save the broadcast chain.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archiveProgram() {
    if (!program) {
      return;
    }

    if (
      !window.confirm(
        `Archive "${program.name}"?`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(
        `/api/admin/radio/programs/${program.id}`,
        {
          method:
            "PATCH",
          headers: {
            "content-type":
              "application/json",
          },
          body:
            JSON.stringify(
              {
                status:
                  "archived",
              },
            ),
        },
      );

      setProgram(
        null,
      );

      setChain([]);

      setNotice(
        "Program archived.",
      );

      await loadPrograms();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not archive the program.",
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
        Opening the program board…
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

      <section className="rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_10%_0%,rgba(217,70,239,0.08),transparent_38%),rgba(2,6,23,0.72)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-fuchsia-100/45">
              Program Builder
            </div>

            <h2 className="mt-2 font-serif text-3xl text-white">
              Build the broadcast chain.
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Pull from the Vault,
              order the hour, set
              transitions, then approve
              the exact chain for air.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {programs.map(
              (item) => (
                <button
                  key={
                    item.id
                  }
                  type="button"
                  onClick={() =>
                    void loadProgram(
                      item.id,
                    )
                  }
                  className={[
                    "rounded-full border px-4 py-2 text-xs transition",
                    program?.id ===
                    item.id
                      ? "border-fuchsia-100/30 bg-fuchsia-100 text-slate-950"
                      : "border-white/8 bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-white",
                  ].join(
                    " ",
                  )}
                >
                  {
                    item.name
                  }
                </button>
              ),
            )}
          </div>
        </div>
      </section>

      {!program ? (
        <section className="rounded-[1.8rem] border border-white/8 bg-slate-950/65 p-6 sm:p-8">
          <div className="mx-auto max-w-xl text-center">
            <ListMusic
              size={30}
              className="mx-auto text-fuchsia-100/30"
            />

            <h3 className="mt-4 font-serif text-3xl">
              Create the first block.
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              A program is a named,
              ordered broadcast chain.
            </p>
          </div>

          <div className="mx-auto mt-7 grid max-w-2xl gap-3 sm:grid-cols-[1fr_150px_auto]">
            <input
              value={
                newName
              }
              onChange={(
                event,
              ) =>
                setNewName(
                  event
                    .target
                    .value,
                )
              }
              className="rounded-xl border border-white/8 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-100/30"
              placeholder="Program name"
            />

            <select
              value={
                newTargetMinutes
              }
              onChange={(
                event,
              ) =>
                setNewTargetMinutes(
                  Number(
                    event
                      .target
                      .value,
                  ),
                )
              }
              className="rounded-xl border border-white/8 bg-[#07111f] px-3 py-3 text-sm text-slate-300"
            >
              <option value={30}>
                30 minutes
              </option>
              <option value={60}>
                60 minutes
              </option>
              <option value={90}>
                90 minutes
              </option>
              <option value={120}>
                120 minutes
              </option>
            </select>

            <button
              type="button"
              disabled={
                busy
              }
              onClick={() =>
                void createProgram()
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-100 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50"
            >
              <Plus
                size={16}
              />
              Create
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <ClockCard
              label="Target"
              value={formatClock(
                targetDurationMs,
              )}
              tone="neutral"
            />

            <ClockCard
              label="Built"
              value={formatClock(
                builtDurationMs,
              )}
              tone="built"
            />

            <ClockCard
              label={
                deltaMs >= 0
                  ? "Left"
                  : "Over"
              }
              value={formatClock(
                Math.abs(
                  deltaMs,
                ),
              )}
              tone={
                deltaMs >= 0
                  ? "left"
                  : "over"
              }
            />
          </section>

          <section className="rounded-[1.5rem] border border-white/8 bg-slate-950/65 p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_auto_auto] lg:items-end">
              <label>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                  Program
                </span>

                <input
                  value={
                    program.name
                  }
                  onChange={(
                    event,
                  ) => {
                    setProgram(
                      {
                        ...program,
                        name:
                          event
                            .target
                            .value,
                      },
                    );

                    setMetadataDirty(
                      true,
                    );
                  }}
                  className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-100/30"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
                  Target minutes
                </span>

                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={Math.round(
                    program.targetDurationMs /
                      60_000,
                  )}
                  onChange={(
                    event,
                  ) => {
                    const minutes =
                      Math.max(
                        1,
                        Number(
                          event
                            .target
                            .value,
                        ) ||
                          1,
                      );

                    setProgram(
                      {
                        ...program,
                        targetDurationMs:
                          Math.round(
                            minutes *
                              60_000,
                          ),
                      },
                    );

                    setMetadataDirty(
                      true,
                    );
                  }}
                  className="w-full rounded-xl border border-white/8 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-fuchsia-100/30"
                />
              </label>

              <button
                type="button"
                disabled={
                  busy ||
                  !metadataDirty
                }
                onClick={() =>
                  void saveMetadata()
                }
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-4 text-xs font-bold text-slate-300 transition hover:text-white disabled:opacity-35"
              >
                <Save
                  size={14}
                />
                Save setup
              </button>

              <button
                type="button"
                disabled={
                  busy
                }
                onClick={() =>
                  void archiveProgram()
                }
                className="inline-flex h-[42px] items-center justify-center rounded-xl border border-white/8 bg-white/[0.02] px-3 text-slate-600 transition hover:border-rose-200/20 hover:text-rose-200 disabled:opacity-35"
                title="Archive program"
              >
                <Archive
                  size={15}
                />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-600">
              <span>
                {
                  chain.length
                } items
              </span>

              <span>·</span>

              <span
                className={
                  program.status ===
                  "ready"
                    ? "text-emerald-300/70"
                    : "text-amber-200/60"
                }
              >
                {
                  program.status
                }
              </span>

              {chainDirty ? (
                <>
                  <span>·</span>
                  <span className="text-fuchsia-100/60">
                    unsaved chain
                  </span>
                </>
              ) : null}
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(280px,.72fr)_minmax(0,1.35fr)]">
            <section className="overflow-hidden rounded-[1.7rem] border border-white/8 bg-slate-950/65">
              <div className="border-b border-white/[0.06] p-4 sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.27em] text-fuchsia-100/45">
                  Vault source
                </div>

                <div className="relative mt-3">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                  />

                  <input
                    value={
                      assetSearch
                    }
                    onChange={(
                      event,
                    ) =>
                      setAssetSearch(
                        event
                          .target
                          .value,
                      )
                    }
                    placeholder="Find audio"
                    className="w-full rounded-xl border border-white/8 bg-black/25 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-100/25"
                  />
                </div>
              </div>

              <div className="max-h-[42rem] space-y-1 overflow-y-auto p-2">
                {visibleAssets.length ? (
                  visibleAssets.map(
                    (
                      asset,
                    ) => (
                      <button
                        key={
                          asset.id
                        }
                        type="button"
                        onClick={() =>
                          addAsset(
                            asset,
                          )
                        }
                        className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-fuchsia-100/[0.055]"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/[0.025] text-slate-600 transition group-hover:border-fuchsia-100/20 group-hover:text-fuchsia-100">
                          <Plus
                            size={14}
                          />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-200">
                            {
                              asset.title
                            }
                          </span>

                          <span className="mt-0.5 block truncate text-xs text-slate-600">
                            {asset.credit ||
                              asset.kind}
                          </span>
                        </span>

                        <span className="text-xs tabular-nums text-slate-600">
                          {formatClock(
                            asset.durationMs,
                          )}
                        </span>
                      </button>
                    ),
                  )
                ) : (
                  <div className="px-5 py-12 text-center text-sm text-slate-600">
                    No active Vault
                    audio matches.
                  </div>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.7rem] border border-white/8 bg-[linear-gradient(145deg,rgba(15,23,42,0.78),rgba(2,6,23,0.88))]">
              <div className="flex flex-col gap-3 border-b border-white/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.27em] text-fuchsia-100/45">
                    Broadcast chain
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    Drag to reorder ·
                    arrows always work.
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !chainDirty
                    }
                    onClick={() =>
                      void saveChain(
                        false,
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.035] px-4 py-2.5 text-xs font-bold text-slate-300 transition hover:text-white disabled:opacity-35"
                  >
                    <Save
                      size={14}
                    />
                    Save chain
                  </button>

                  <button
                    type="button"
                    disabled={
                      busy ||
                      chain.length ===
                        0
                    }
                    onClick={() =>
                      void saveChain(
                        true,
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-fuchsia-100 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-white disabled:opacity-40"
                  >
                    <Radio
                      size={14}
                    />
                    Mark ready
                  </button>
                </div>
              </div>

              {chain.length ? (
                <div className="space-y-2 p-2 sm:p-3">
                  {chain.map(
                    (
                      item,
                      index,
                    ) => (
                      <div
                        key={
                          item.key
                        }
                        draggable
                        onDragStart={() =>
                          setDraggedIndex(
                            index,
                          )
                        }
                        onDragEnd={() =>
                          setDraggedIndex(
                            null,
                          )
                        }
                        onDragOver={(
                          event,
                        ) =>
                          event.preventDefault()
                        }
                        onDrop={(
                          event,
                        ) =>
                          onDrop(
                            event,
                            index,
                          )
                        }
                        className={[
                          "group grid gap-3 rounded-[1.15rem] border px-3 py-3 transition sm:grid-cols-[28px_36px_minmax(0,1fr)_145px_94px_auto] sm:items-center",
                          draggedIndex ===
                          index
                            ? "border-fuchsia-100/30 bg-fuchsia-200/[0.07]"
                            : "border-white/[0.065] bg-black/20 hover:border-white/12",
                        ].join(
                          " ",
                        )}
                      >
                        <div className="cursor-grab text-slate-700 active:cursor-grabbing">
                          <GripVertical
                            size={17}
                          />
                        </div>

                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/[0.025] text-xs font-bold tabular-nums text-slate-500">
                          {index +
                            1}
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-100">
                            {
                              item.asset
                                .title
                            }
                          </div>

                          <div className="mt-0.5 flex gap-2 text-xs text-slate-600">
                            <span className="truncate">
                              {item.asset
                                .credit ||
                                item.asset
                                  .kind}
                            </span>

                            <span>·</span>

                            <span className="tabular-nums">
                              {formatClock(
                                item.asset
                                  .durationMs,
                              )}
                            </span>
                          </div>
                        </div>

                        <select
                          value={
                            item.transition
                          }
                          onChange={(
                            event,
                          ) => {
                            const transition =
                              event
                                .target
                                .value as Transition;

                            updateChain(
                              (
                                current,
                              ) =>
                                current.map(
                                  (
                                    entry,
                                    itemIndex,
                                  ) =>
                                    itemIndex ===
                                    index
                                      ? {
                                          ...entry,
                                          transition,
                                          crossfadeMs:
                                            transition ===
                                            "crossfade"
                                              ? entry.crossfadeMs ||
                                                2000
                                              : 0,
                                        }
                                      : entry,
                                ),
                            );
                          }}
                          className="rounded-lg border border-white/8 bg-[#07111f] px-2 py-2 text-xs text-slate-300"
                        >
                          <option value="cut">
                            Cut
                          </option>
                          <option value="crossfade">
                            Crossfade
                          </option>
                          <option value="bumper">
                            Bumper
                          </option>
                        </select>

                        {item.transition ===
                        "crossfade" ? (
                          <label className="flex items-center gap-1 text-xs text-slate-600">
                            <input
                              type="number"
                              min={0}
                              max={
                                30000
                              }
                              step={
                                500
                              }
                              value={
                                item.crossfadeMs
                              }
                              onChange={(
                                event,
                              ) => {
                                const value =
                                  Math.max(
                                    0,
                                    Math.min(
                                      30000,
                                      Number(
                                        event
                                          .target
                                          .value,
                                      ) ||
                                        0,
                                    ),
                                  );

                                updateChain(
                                  (
                                    current,
                                  ) =>
                                    current.map(
                                      (
                                        entry,
                                        itemIndex,
                                      ) =>
                                        itemIndex ===
                                        index
                                          ? {
                                              ...entry,
                                              crossfadeMs:
                                                value,
                                            }
                                          : entry,
                                    ),
                                );
                              }}
                              className="w-16 rounded-lg border border-white/8 bg-black/25 px-2 py-2 text-right tabular-nums text-slate-300"
                            />
                            ms
                          </label>
                        ) : (
                          <div className="text-center text-xs text-slate-700">
                            —
                          </div>
                        )}

                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={
                              index ===
                              0
                            }
                            onClick={() =>
                              moveItem(
                                index,
                                index -
                                  1,
                              )
                            }
                            className="rounded-lg p-2 text-slate-600 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-20"
                            title="Move up"
                          >
                            <ArrowUp
                              size={
                                14
                              }
                            />
                          </button>

                          <button
                            type="button"
                            disabled={
                              index ===
                              chain.length -
                                1
                            }
                            onClick={() =>
                              moveItem(
                                index,
                                index +
                                  1,
                              )
                            }
                            className="rounded-lg p-2 text-slate-600 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-20"
                            title="Move down"
                          >
                            <ArrowDown
                              size={
                                14
                              }
                            />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              removeItem(
                                index,
                              )
                            }
                            className="rounded-lg p-2 text-slate-700 transition hover:bg-rose-500/10 hover:text-rose-200"
                            title="Remove from chain"
                          >
                            <Trash2
                              size={
                                14
                              }
                            />
                          </button>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="px-6 py-20 text-center">
                  <ListMusic
                    size={28}
                    className="mx-auto text-fuchsia-100/20"
                  />

                  <div className="mt-4 font-serif text-2xl text-slate-300">
                    The chain is empty.
                  </div>

                  <p className="mt-2 text-sm text-slate-600">
                    Add audio from the
                    Vault on the left.
                  </p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function ClockCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone:
    | "neutral"
    | "built"
    | "left"
    | "over";
}) {
  const valueClass =
    tone === "over"
      ? "text-rose-200"
      : tone === "built"
        ? "text-fuchsia-100"
        : tone === "left"
          ? "text-emerald-200"
          : "text-slate-100";

  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-slate-950/65 px-5 py-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
        <Clock3
          size={12}
        />
        {label}
      </div>

      <div
        className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}
