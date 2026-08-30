"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  Check,
  Clock3,
  FileAudio2,
  HardDrive,
  Loader2,
  Music2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Tags,
  UploadCloud,
  X,
} from "lucide-react";

type RadioAsset = {
  id: number;
  publicId: string;
  title: string;
  credit: string | null;
  kind: string;
  tags: string[];
  notes: string | null;
  audioOriginalFilename: string;
  audioMediaType: string;
  audioByteSize: string;
  audioSha256: string;
  durationMs: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AssetDraft = {
  title: string;
  credit: string;
  kind: string;
  tags: string;
  notes: string;
};

type UploadJob = {
  key: string;
  name: string;
  state:
    | "reading"
    | "uploading"
    | "done"
    | "error";
  detail?: string;
};

function formatDuration(
  durationMs: number,
) {
  const totalSeconds =
    Math.max(
      0,
      Math.round(
        durationMs / 1000,
      ),
    );

  const minutes =
    Math.floor(
      totalSeconds / 60,
    );

  const seconds =
    totalSeconds % 60;

  return `${minutes}:${String(
    seconds,
  ).padStart(2, "0")}`;
}

function formatBytes(
  raw: string,
) {
  const bytes =
    Number(raw);

  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return "—";
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes / 1024
    ).toFixed(0)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(1)} MB`;
}

function assetDraft(
  asset: RadioAsset,
): AssetDraft {
  return {
    title:
      asset.title,
    credit:
      asset.credit || "",
    kind:
      asset.kind,
    tags:
      asset.tags.join(", "),
    notes:
      asset.notes || "",
  };
}

function audioDurationMs(
  file: File,
) {
  return new Promise<number>(
    (
      resolve,
      reject,
    ) => {
      const element =
        document.createElement(
          "audio",
        );

      const url =
        URL.createObjectURL(
          file,
        );

      let settled = false;

      const finish = () => {
        element.removeAttribute(
          "src",
        );
        element.load();

        URL.revokeObjectURL(
          url,
        );
      };

      element.preload =
        "metadata";

      element.onloadedmetadata =
        () => {
          if (settled) {
            return;
          }

          settled = true;

          const duration =
            element.duration;

          finish();

          if (
            !Number.isFinite(
              duration,
            ) ||
            duration <= 0
          ) {
            reject(
              new Error(
                "Could not read audio duration.",
              ),
            );
            return;
          }

          resolve(
            Math.round(
              duration * 1000,
            ),
          );
        };

      element.onerror =
        () => {
          if (settled) {
            return;
          }

          settled = true;
          finish();

          reject(
            new Error(
              "Could not read audio metadata.",
            ),
          );
        };

      element.src = url;
    },
  );
}

export default function RadioWoloVault() {
  const [
    assets,
    setAssets,
  ] = useState<
    RadioAsset[]
  >([]);

  const [
    drafts,
    setDrafts,
  ] = useState<
    Record<
      number,
      AssetDraft
    >
  >({});

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    kindFilter,
    setKindFilter,
  ] = useState("all");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    dragging,
    setDragging,
  ] = useState(false);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    uploadJobs,
    setUploadJobs,
  ] = useState<
    UploadJob[]
  >([]);

  const [
    savingId,
    setSavingId,
  ] = useState<
    number | null
  >(null);

  const [
    playingId,
    setPlayingId,
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

  const inputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const audioRef =
    useRef<HTMLAudioElement | null>(
      null,
    );

  const load =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetch(
              "/api/admin/radio/assets",
              {
                cache:
                  "no-store",
              },
            );

          const payload =
            (await response
              .json()
              .catch(
                () => ({}),
              )) as {
              assets?:
                RadioAsset[];
              detail?:
                string;
            };

          if (
            !response.ok
          ) {
            throw new Error(
              payload.detail ||
                "Could not load the Radio WOLO Vault.",
            );
          }

          const next =
            payload.assets ||
            [];

          setAssets(next);

          setDrafts(
            Object.fromEntries(
              next.map(
                (
                  asset,
                ) => [
                  asset.id,
                  assetDraft(
                    asset,
                  ),
                ],
              ),
            ),
          );
        } catch (
          cause
        ) {
          setError(
            cause instanceof
              Error
              ? cause.message
              : "Could not load the Radio WOLO Vault.",
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(
    () => {
      void load();
    },
    [load],
  );

  useEffect(
    () => {
      return () => {
        audioRef.current?.pause();
      };
    },
    [],
  );

  const kinds =
    useMemo(
      () =>
        Array.from(
          new Set(
            assets.map(
              (asset) =>
                asset.kind,
            ),
          ),
        ).sort(),
      [assets],
    );

  const visibleAssets =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return assets.filter(
          (asset) => {
            if (
              kindFilter !==
                "all" &&
              asset.kind !==
                kindFilter
            ) {
              return false;
            }

            if (!query) {
              return true;
            }

            const haystack =
              [
                asset.title,
                asset.credit ||
                  "",
                asset.kind,
                ...asset.tags,
                asset.audioOriginalFilename,
              ]
                .join(" ")
                .toLowerCase();

            return haystack.includes(
              query,
            );
          },
        );
      },
      [
        assets,
        kindFilter,
        search,
      ],
    );

  const totalDuration =
    useMemo(
      () =>
        assets.reduce(
          (
            total,
            asset,
          ) =>
            total +
            asset.durationMs,
          0,
        ),
      [assets],
    );

  function updateDraft(
    id: number,
    change: Partial<AssetDraft>,
  ) {
    setDrafts(
      (current) => ({
        ...current,
        [id]: {
          ...current[id],
          ...change,
        },
      }),
    );
  }

  function updateJob(
    key: string,
    change: Partial<UploadJob>,
  ) {
    setUploadJobs(
      (current) =>
        current.map(
          (job) =>
            job.key ===
            key
              ? {
                  ...job,
                  ...change,
                }
              : job,
        ),
    );
  }

  async function uploadFiles(
    files:
      | FileList
      | File[],
  ) {
    const list =
      Array.from(files)
        .filter(
          (file) =>
            file.size > 0,
        );

    if (!list.length) {
      return;
    }

    setUploading(true);
    setError(null);
    setNotice(null);

    const jobs =
      list.map(
        (
          file,
          index,
        ) => ({
          key:
            `${Date.now()}-${index}-${file.name}`,
          name:
            file.name,
          state:
            "reading" as const,
        }),
      );

    setUploadJobs(
      jobs,
    );

    let uploaded = 0;

    for (
      let index = 0;
      index <
      list.length;
      index += 1
    ) {
      const file =
        list[index];

      const job =
        jobs[index];

      try {
        const durationMs =
          await audioDurationMs(
            file,
          );

        updateJob(
          job.key,
          {
            state:
              "uploading",
            detail:
              formatDuration(
                durationMs,
              ),
          },
        );

        const form =
          new FormData();

        form.set(
          "audio",
          file,
        );

        form.set(
          "durationMs",
          String(
            durationMs,
          ),
        );

        const response =
          await fetch(
            "/api/admin/radio/assets",
            {
              method:
                "POST",
              body:
                form,
            },
          );

        const payload =
          (await response
            .json()
            .catch(
              () => ({}),
            )) as {
            detail?:
              string;
          };

        if (
          !response.ok
        ) {
          throw new Error(
            payload.detail ||
              "Upload failed.",
          );
        }

        uploaded += 1;

        updateJob(
          job.key,
          {
            state:
              "done",
            detail:
              "Preserved",
          },
        );
      } catch (
        cause
      ) {
        updateJob(
          job.key,
          {
            state:
              "error",
            detail:
              cause instanceof
                Error
                ? cause.message
                : "Upload failed.",
          },
        );
      }
    }

    await load();

    if (
      uploaded > 0
    ) {
      setNotice(
        `${uploaded} ${
          uploaded === 1
            ? "asset"
            : "assets"
        } added to the Vault.`,
      );
    }

    setUploading(false);
  }

  async function save(
    id: number,
  ) {
    const draft =
      drafts[id];

    if (!draft) {
      return;
    }

    setSavingId(id);
    setError(null);
    setNotice(null);

    try {
      const response =
        await fetch(
          `/api/admin/radio/assets/${id}`,
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
                  title:
                    draft.title,
                  credit:
                    draft.credit,
                  kind:
                    draft.kind,
                  tags:
                    draft.tags,
                  notes:
                    draft.notes,
                },
              ),
          },
        );

      const payload =
        (await response
          .json()
          .catch(
            () => ({}),
          )) as {
          detail?:
            string;
        };

      if (
        !response.ok
      ) {
        throw new Error(
          payload.detail ||
            "Could not update the asset.",
        );
      }

      setNotice(
        "Vault metadata saved.",
      );

      await load();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not update the asset.",
      );
    } finally {
      setSavingId(null);
    }
  }

  async function archive(
    asset: RadioAsset,
  ) {
    if (
      !window.confirm(
        `Archive "${asset.title}" from the active Vault? The media remains preserved.`,
      )
    ) {
      return;
    }

    setSavingId(
      asset.id,
    );
    setError(null);
    setNotice(null);

    try {
      const response =
        await fetch(
          `/api/admin/radio/assets/${asset.id}`,
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

      const payload =
        (await response
          .json()
          .catch(
            () => ({}),
          )) as {
          detail?:
            string;
        };

      if (
        !response.ok
      ) {
        throw new Error(
          payload.detail ||
            "Could not archive the asset.",
        );
      }

      if (
        playingId ===
        asset.id
      ) {
        audioRef.current?.pause();
        setPlayingId(
          null,
        );
      }

      setNotice(
        `${asset.title} archived.`,
      );

      await load();
    } catch (
      cause
    ) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Could not archive the asset.",
      );
    } finally {
      setSavingId(null);
    }
  }

  function togglePreview(
    asset: RadioAsset,
  ) {
    if (
      playingId ===
      asset.id &&
      audioRef.current
    ) {
      audioRef.current.pause();
      setPlayingId(
        null,
      );
      return;
    }

    audioRef.current?.pause();

    const audio =
      new Audio(
        `/api/admin/radio/assets/${asset.id}/audio`,
      );

    audio.preload =
      "metadata";

    audio.onended =
      () => {
        setPlayingId(
          null,
        );
      };

    audio.onerror =
      () => {
        setPlayingId(
          null,
        );

        setError(
          "Could not preview that Radio WOLO asset.",
        );
      };

    audioRef.current =
      audio;

    setPlayingId(
      asset.id,
    );

    void audio
      .play()
      .catch(
        () => {
          setPlayingId(
            null,
          );
        },
      );
  }

  function onInput(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    if (
      event.target.files
    ) {
      void uploadFiles(
        event.target.files,
      );

      event.target.value =
        "";
    }
  }

  function onDrop(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    setDragging(false);

    if (
      event.dataTransfer
        .files.length
    ) {
      void uploadFiles(
        event.dataTransfer.files,
      );
    }
  }

  return (
    <div className="space-y-5">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a"
        onChange={onInput}
        className="hidden"
      />

      <section
        onDragEnter={(
          event,
        ) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(
          event,
        ) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(
          event,
        ) => {
          if (
            event.currentTarget ===
            event.target
          ) {
            setDragging(
              false,
            );
          }
        }}
        onDrop={onDrop}
        className={[
          "group relative overflow-hidden rounded-[1.8rem] border border-dashed p-8 transition sm:p-10",
          dragging
            ? "border-fuchsia-200/65 bg-fuchsia-300/[0.10]"
            : "border-fuchsia-100/20 bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,0.10),transparent_52%),rgba(2,6,23,0.68)] hover:border-fuchsia-100/35",
        ].join(
          " ",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.025),transparent)] opacity-0 transition group-hover:opacity-100" />

        <div className="relative mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-100/20 bg-fuchsia-200/[0.08] text-fuchsia-100 shadow-[0_0_45px_rgba(217,70,239,0.12)]">
            {uploading ? (
              <Loader2
                size={23}
                className="animate-spin"
              />
            ) : (
              <UploadCloud
                size={24}
              />
            )}
          </div>

          <div className="mt-5 text-xs font-bold uppercase tracking-[0.34em] text-fuchsia-100/55">
            Private Vault
          </div>

          <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
            Drop audio into
            Radio WOLO.
          </h2>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
            Songs, bumpers,
            taunts, talk-ups,
            station IDs,
            promos, news,
            interviews — whatever
            the station needs.
          </p>

          <button
            type="button"
            disabled={uploading}
            onClick={() =>
              inputRef.current?.click()
            }
            className="pointer-events-auto mt-6 inline-flex items-center gap-2 rounded-full border border-fuchsia-100/20 bg-fuchsia-100 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus
              size={16}
            />
            Choose audio
          </button>

          <div className="mt-4 text-[11px] uppercase tracking-[0.2em] text-slate-600">
            MP3 · WAV · OGG ·
            M4A · 60 MB max each
          </div>
        </div>
      </section>

      {uploadJobs.length ? (
        <section className="rounded-2xl border border-white/8 bg-slate-950/70 p-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
            Intake
          </div>

          <div className="space-y-2">
            {uploadJobs.map(
              (job) => (
                <div
                  key={
                    job.key
                  }
                  className="flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.025] px-3 py-2.5"
                >
                  <div className="text-slate-500">
                    {job.state ===
                    "done" ? (
                      <Check
                        size={
                          15
                        }
                        className="text-emerald-300"
                      />
                    ) : job.state ===
                      "error" ? (
                      <X
                        size={
                          15
                        }
                        className="text-rose-300"
                      />
                    ) : (
                      <Loader2
                        size={
                          15
                        }
                        className="animate-spin text-fuchsia-200"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {
                      job.name
                    }
                  </div>

                  <div className="max-w-[45%] truncate text-xs text-slate-500">
                    {job.detail ||
                      (job.state ===
                      "reading"
                        ? "Reading metadata"
                        : "Uploading")}
                  </div>
                </div>
              ),
            )}
          </div>
        </section>
      ) : null}

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

      <section className="rounded-[1.6rem] border border-white/8 bg-slate-950/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-5">
            <VaultMetric
              icon={
                <FileAudio2
                  size={15}
                />
              }
              value={String(
                assets.length,
              )}
              label="assets"
            />

            <VaultMetric
              icon={
                <Clock3
                  size={15}
                />
              }
              value={formatDuration(
                totalDuration,
              )}
              label="audio"
            />

            <VaultMetric
              icon={
                <Tags
                  size={15}
                />
              }
              value={String(
                kinds.length,
              )}
              label="types"
            />
          </div>

          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
            <label className="relative min-w-0 flex-1 lg:max-w-sm">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />

              <input
                value={
                  search
                }
                onChange={(
                  event,
                ) =>
                  setSearch(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Search the Vault"
                className="w-full rounded-xl border border-white/8 bg-black/25 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-fuchsia-100/25"
              />
            </label>

            <select
              value={
                kindFilter
              }
              onChange={(
                event,
              ) =>
                setKindFilter(
                  event
                    .target
                    .value,
                )
              }
              className="rounded-xl border border-white/8 bg-[#07111f] px-3 py-2.5 text-sm text-slate-300 outline-none focus:border-fuchsia-100/25"
            >
              <option value="all">
                All types
              </option>

              {kinds.map(
                (kind) => (
                  <option
                    key={
                      kind
                    }
                    value={
                      kind
                    }
                  >
                    {kind}
                  </option>
                ),
              )}
            </select>

            <button
              type="button"
              onClick={() =>
                void load()
              }
              className="inline-flex items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] px-3 text-slate-400 transition hover:border-white/14 hover:text-white"
              aria-label="Refresh Vault"
              title="Refresh Vault"
            >
              <RefreshCw
                size={15}
              />
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-[1.6rem] border border-white/8 bg-slate-950/50 text-slate-500">
          <Loader2
            className="mr-2 animate-spin"
            size={17}
          />
          Opening the Vault…
        </div>
      ) : visibleAssets.length ? (
        <section className="space-y-3">
          {visibleAssets.map(
            (asset) => {
              const draft =
                drafts[
                  asset.id
                ] ||
                assetDraft(
                  asset,
                );

              const playing =
                playingId ===
                asset.id;

              return (
                <article
                  key={
                    asset.id
                  }
                  className="group overflow-hidden rounded-[1.45rem] border border-white/8 bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(2,6,23,0.88))] transition hover:border-fuchsia-100/15"
                >
                  <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[auto_minmax(0,1.3fr)_minmax(170px,.55fr)_minmax(230px,.75fr)_auto] xl:items-center">
                    <button
                      type="button"
                      onClick={() =>
                        togglePreview(
                          asset,
                        )
                      }
                      className={[
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition",
                        playing
                          ? "border-fuchsia-100/35 bg-fuchsia-200 text-slate-950 shadow-[0_0_30px_rgba(217,70,239,0.18)]"
                          : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-fuchsia-100/30 hover:text-fuchsia-100",
                      ].join(
                        " ",
                      )}
                      aria-label={
                        playing
                          ? `Pause ${asset.title}`
                          : `Preview ${asset.title}`
                      }
                    >
                      {playing ? (
                        <Pause
                          size={
                            16
                          }
                          fill="currentColor"
                        />
                      ) : (
                        <Play
                          size={
                            16
                          }
                          fill="currentColor"
                        />
                      )}
                    </button>

                    <div className="min-w-0">
                      <input
                        value={
                          draft.title
                        }
                        onChange={(
                          event,
                        ) =>
                          updateDraft(
                            asset.id,
                            {
                              title:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        className="w-full border-0 bg-transparent p-0 text-lg font-semibold text-white outline-none placeholder:text-slate-600"
                        placeholder="Title"
                      />

                      <input
                        value={
                          draft.credit
                        }
                        onChange={(
                          event,
                        ) =>
                          updateDraft(
                            asset.id,
                            {
                              credit:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        className="mt-1 w-full border-0 bg-transparent p-0 text-sm text-fuchsia-100/75 outline-none placeholder:text-slate-600"
                        placeholder="Artist / voice / announcer"
                      />

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                        <span className="inline-flex items-center gap-1">
                          <Clock3
                            size={
                              11
                            }
                          />
                          {formatDuration(
                            asset.durationMs,
                          )}
                        </span>

                        <span className="inline-flex items-center gap-1">
                          <HardDrive
                            size={
                              11
                            }
                          />
                          {formatBytes(
                            asset.audioByteSize,
                          )}
                        </span>

                        <span className="truncate">
                          {
                            asset.audioOriginalFilename
                          }
                        </span>
                      </div>
                    </div>

                    <label className="min-w-0">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600">
                        Type
                      </span>

                      <input
                        value={
                          draft.kind
                        }
                        onChange={(
                          event,
                        ) =>
                          updateDraft(
                            asset.id,
                            {
                              kind:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        placeholder="song"
                        list="radio-wolo-kind-options"
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-fuchsia-100/25"
                      />
                    </label>

                    <label className="min-w-0">
                      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600">
                        Tags
                      </span>

                      <input
                        value={
                          draft.tags
                        }
                        onChange={(
                          event,
                        ) =>
                          updateDraft(
                            asset.id,
                            {
                              tags:
                                event
                                  .target
                                  .value,
                            },
                          )
                        }
                        placeholder="wolomania, night, jim"
                        className="w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-fuchsia-100/25"
                      />
                    </label>

                    <div className="flex items-center gap-2 xl:justify-end">
                      <button
                        type="button"
                        disabled={
                          savingId !==
                          null
                        }
                        onClick={() =>
                          void save(
                            asset.id,
                          )
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.035] text-slate-400 transition hover:border-fuchsia-100/25 hover:text-fuchsia-100 disabled:opacity-40"
                        title="Save metadata"
                        aria-label={`Save ${asset.title}`}
                      >
                        {savingId ===
                        asset.id ? (
                          <Loader2
                            size={
                              15
                            }
                            className="animate-spin"
                          />
                        ) : (
                          <Save
                            size={
                              15
                            }
                          />
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={
                          savingId !==
                          null
                        }
                        onClick={() =>
                          void archive(
                            asset,
                          )
                        }
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.025] text-slate-600 transition hover:border-rose-200/20 hover:text-rose-200 disabled:opacity-40"
                        title="Archive asset"
                        aria-label={`Archive ${asset.title}`}
                      >
                        <Archive
                          size={
                            15
                          }
                        />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-white/[0.055] px-4 py-2.5 sm:px-5">
                    <textarea
                      rows={1}
                      value={
                        draft.notes
                      }
                      onChange={(
                        event,
                      ) =>
                        updateDraft(
                          asset.id,
                          {
                            notes:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                      placeholder="Operator note · optional"
                      className="block w-full resize-none border-0 bg-transparent p-0 text-xs leading-5 text-slate-500 outline-none placeholder:text-slate-700 focus:text-slate-300"
                    />
                  </div>
                </article>
              );
            },
          )}
        </section>
      ) : (
        <div className="rounded-[1.8rem] border border-white/8 bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,0.06),transparent_50%),rgba(2,6,23,0.62)] px-6 py-16 text-center">
          <Music2
            size={30}
            className="mx-auto text-fuchsia-100/25"
          />

          <div className="mt-4 font-serif text-2xl text-slate-300">
            {assets.length
              ? "Nothing matches that signal."
              : "The Vault is waiting."}
          </div>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
            {assets.length
              ? "Change the search or type filter."
              : "Drop your first song, bumper, taunt, station ID, or broadcast fragment above."}
          </p>
        </div>
      )}

      <datalist id="radio-wolo-kind-options">
        {[
          "song",
          "bumper",
          "taunt",
          "talk-up",
          "station-id",
          "promo",
          "newscast",
          "interview",
          "special",
          ...kinds,
        ]
          .filter(
            (
              kind,
              index,
              all,
            ) =>
              all.indexOf(
                kind,
              ) ===
              index,
          )
          .map(
            (kind) => (
              <option
                key={
                  kind
                }
                value={
                  kind
                }
              />
            ),
          )}
      </datalist>
    </div>
  );
}

function VaultMetric({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-fuchsia-100/45">
        {icon}
      </span>

      <span className="font-semibold text-slate-200">
        {value}
      </span>

      <span className="text-slate-600">
        {label}
      </span>
    </div>
  );
}
