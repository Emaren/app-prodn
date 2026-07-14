"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import Link from "next/link";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/hooks/useUserAuth";

type UploadResult = {
  filename?: string;
  ok?: boolean;
  status?: number;
  message?: string;
  detail?: string;
  finalityStatus?: string;
  finality_status?: string;
  finalAccepted?: boolean;
  final_accepted?: boolean;
  shouldSettle?: boolean;
  should_settle?: boolean;
  archived?: boolean;
  raw_replay_archived?: boolean;
  parsed?: boolean;
  parse_completed?: boolean;
  resultReady?: boolean;
  reviewRouted?: boolean;
};

type UploadQueueResult = UploadResult & {
  sourceFile?: string;
};

const SUPPORTED_EXTENSIONS = [
  ".zip",
  ".aoe2record",
  ".aoe2mpgame",
  ".mgz",
  ".mgx",
  ".mgl",
];

const ACCEPT_STRING = SUPPORTED_EXTENSIONS.join(",");

function extensionFor(filename: string) {
  const normalized = filename.toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function isSupportedFile(file: File) {
  return SUPPORTED_EXTENSIONS.includes(extensionFor(file.name));
}

function isReplayPack(file: File | null) {
  return Boolean(file?.name.toLowerCase().endsWith(".zip"));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function fileKindLabel(file: File) {
  return isReplayPack(file) ? "ZIP pack" : "Replay";
}

function mergeFiles(existing: File[], incoming: File[]) {
  const seen = new Set(existing.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  const merged = [...existing];

  for (const file of incoming) {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(file);
  }

  return merged;
}

const TRUSTED_FINAL_STATUSES = new Set([
  "trusted_final",
  "trusted_final_duplicate",
  "trusted_final_refreshed",
  "reviewed_match_duplicate",
  "reviewed_match_refreshed",
]);

function normalizeUploadReceipt(result: UploadResult) {
  const finalityStatus = result.finalityStatus || result.finality_status || "";
  const resultReady = Boolean(
    result.resultReady ||
      result.finalAccepted ||
      result.final_accepted ||
      result.shouldSettle ||
      result.should_settle ||
      TRUSTED_FINAL_STATUSES.has(finalityStatus)
  );
  const archived = Boolean(result.archived || result.raw_replay_archived);
  const parsed = Boolean(result.parsed || result.parse_completed || resultReady);

  return {
    archived,
    parsed,
    resultReady,
    reviewRouted: Boolean(!resultReady && (result.reviewRouted || result.ok)),
  };
}

function uploadReceiptLabel(result: UploadResult) {
  if (!result.ok) return result.detail || result.message || "failed";

  const receipt = normalizeUploadReceipt(result);
  if (receipt.resultReady) return "result ready";
  if (receipt.reviewRouted) return "private review";
  if (receipt.parsed) return "parsed";
  if (receipt.archived) return "secured";
  return "received";
}

function ReplayVaultReleaseStamp() {
  return (
    <aside className="mx-auto mt-auto w-full max-w-3xl pt-14 text-center md:pt-20">
      <div className="mx-auto max-w-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-[0.48em] text-amber-200/75">
          Updated
        </div>
        <div className="mt-2 text-xl font-semibold tracking-tight text-white">
          Replay Vault v1.2
        </div>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.38em] text-slate-400">
          Jul 7, 2026
        </div>
        <div className="mx-auto mt-4 flex w-36 items-center justify-center gap-3 text-amber-300/70">
          <span className="h-px flex-1 bg-amber-300/35" />
          <span className="h-1.5 w-1.5 rotate-45 border border-amber-300/60" />
          <span className="h-px flex-1 bg-amber-300/35" />
        </div>
        <p className="mt-4 whitespace-nowrap text-[11px] leading-5 text-slate-300 sm:text-xs">
          Drag + drop live · multi-file queues · ZIP packs preserved.
        </p>
      </div>
    </aside>
  );
}

export default function UploadReplay() {
  const { isAuthenticated } = useUserAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<UploadQueueResult[]>([]);

  const selectedReplayCount = useMemo(
    () => selectedFiles.filter((file) => !isReplayPack(file)).length,
    [selectedFiles]
  );

  const selectedPackCount = useMemo(
    () => selectedFiles.filter((file) => isReplayPack(file)).length,
    [selectedFiles]
  );

  const selectedTotalBytes = useMemo(
    () => selectedFiles.reduce((total, file) => total + file.size, 0),
    [selectedFiles]
  );

  const uploadButtonLabel = useMemo(() => {
    if (isUploading) return "Uploading...";
    if (selectedFiles.length === 0) return "Upload Replay";
    if (selectedFiles.length === 1) {
      return isReplayPack(selectedFiles[0]) ? "Import Replay Pack" : "Upload Replay";
    }

    return `Upload ${selectedFiles.length} Files`;
  }, [isUploading, selectedFiles]);

  const addFiles = useCallback((files: File[]) => {
    const supported = files.filter(isSupportedFile);
    const unsupported = files.filter((file) => !isSupportedFile(file));

    if (supported.length > 0) {
      setSelectedFiles((existing) => mergeFiles(existing, supported));
      setResults([]);
      setStatus(
        unsupported.length > 0
          ? `Added ${supported.length} supported file${supported.length === 1 ? "" : "s"}. Skipped ${unsupported.length} unsupported file${unsupported.length === 1 ? "" : "s"}.`
          : `Added ${supported.length} file${supported.length === 1 ? "" : "s"} to the vault queue.`
      );
    } else if (unsupported.length > 0) {
      setStatus(`No supported AoE2 files found. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}.`);
      setResults([]);
    }
  }, []);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = "";
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;

    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFiles(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;

    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;

    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    addFiles(Array.from(event.dataTransfer.files || []));
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((files) => files.filter((_, index) => index !== indexToRemove));
    setResults([]);
  };

  const clearQueue = () => {
    setSelectedFiles([]);
    setResults([]);
    setStatus("");
  };

  const uploadOneFile = async (file: File): Promise<UploadQueueResult[]> => {
    const formData = new FormData();
    formData.append("file", file);

    const endpoint = isReplayPack(file)
      ? "/api/replay/upload-package"
      : "/api/replay/upload";

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
      message?: string;
      results?: UploadResult[];
    } & UploadResult;

    if (Array.isArray(payload.results) && payload.results.length > 0) {
      return payload.results.map((result) => ({
        ...result,
        sourceFile: file.name,
      }));
    }

    return [
      {
        filename: file.name,
        sourceFile: file.name,
        ok: response.ok,
        status: response.status,
        message: payload.message,
        finalityStatus: payload.finalityStatus || payload.finality_status,
        finalAccepted: payload.finalAccepted || payload.final_accepted,
        shouldSettle: payload.shouldSettle || payload.should_settle,
        archived: payload.archived || payload.raw_replay_archived,
        parsed: payload.parsed || payload.parse_completed,
        resultReady: normalizeUploadReceipt({ ...payload, ok: response.ok }).resultReady,
        reviewRouted: normalizeUploadReceipt({ ...payload, ok: response.ok }).reviewRouted,
        detail: response.ok
          ? payload.message || `${file.name} uploaded.`
          : payload.detail || payload.message || `${file.name} failed.`,
      },
    ];
  };

  const submit = async () => {
    if (selectedFiles.length === 0) {
      setStatus("Choose or drop a replay file or ZIP pack first.");
      setResults([]);
      return;
    }

    setIsUploading(true);
    setResults([]);

    const allResults: UploadQueueResult[] = [];

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];

        setStatus(
          selectedFiles.length === 1
            ? isReplayPack(file)
              ? `Importing replay pack ${file.name}...`
              : `Uploading ${file.name}...`
            : `Uploading ${index + 1} of ${selectedFiles.length}: ${file.name}`
        );

        try {
          const fileResults = await uploadOneFile(file);
          allResults.push(...fileResults);
          setResults([...allResults]);
        } catch (error) {
          console.error(error);
          const failedResult: UploadQueueResult = {
            filename: file.name,
            sourceFile: file.name,
            ok: false,
            detail: "Upload failed due to network or server error.",
          };

          allResults.push(failedResult);
          setResults([...allResults]);
        }
      }

      const failures = allResults.filter((result) => result.ok === false).length;
      const ready = allResults.filter(
        (result) => result.ok && normalizeUploadReceipt(result).resultReady
      ).length;
      const review = allResults.filter(
        (result) => result.ok && normalizeUploadReceipt(result).reviewRouted
      ).length;
      const statusParts = [
        ready > 0 ? `${ready} result${ready === 1 ? "" : "s"} ready` : null,
        review > 0 ? `${review} secured for private review` : null,
        failures > 0 ? `${failures} upload${failures === 1 ? "" : "s"} failed` : null,
      ].filter(Boolean);

      setStatus(statusParts.join(" · ") || "Replay files received.");
    } finally {
      setIsUploading(false);
    }
  };

  const authenticatedBody = (
    <>
      <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-[0_30px_110px_rgba(0,0,0,0.26)]">
        <div className="text-xs uppercase tracking-[0.35em] text-white/45">
          Replay Upload
        </div>

        <h1 className="mt-3 text-[1.7rem] font-medium tracking-[-0.02em] text-slate-100 sm:text-3xl">
          Upload a replay manually
        </h1>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          .zip, .aoe2record, .aoe2mpgame, .mgz, .mgx, .mgl.
          <br />
          The watcher is still best for live proof; this vault keeps old battles useful.
        </p>

        <div
          className={[
            "mt-6 rounded-[1.75rem] border border-dashed px-5 py-6 transition duration-300",
            isDraggingFiles
              ? "border-amber-200/80 bg-amber-200/[0.075] shadow-[0_0_70px_rgba(251,191,36,0.13)]"
              : "border-white/13 bg-slate-950/58 hover:border-amber-100/24 hover:bg-white/[0.035]",
          ].join(" ")}
          data-upload-drop-zone
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_STRING}
            multiple
            className="sr-only"
            onChange={handleInputChange}
          />

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/62">
                Drop zone
              </div>
              <p className="mt-3 max-w-xl text-sm font-medium leading-6 text-slate-300">
                Drag & drop one replay, many replays, or ZIP packs. ZIP archives are unpacked server-side and each supported battle is imported.
              </p>
            </div>

            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-amber-100/20 bg-white/[0.045] px-5 py-2.5 text-sm font-semibold text-amber-50 transition hover:border-amber-100/38 hover:bg-amber-100/[0.08]"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Files
            </button>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/45">
                  Vault Queue
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} · {selectedReplayCount} replay{selectedReplayCount === 1 ? "" : "s"} · {selectedPackCount} pack{selectedPackCount === 1 ? "" : "s"} · {formatBytes(selectedTotalBytes)}
                </div>
              </div>

              <button
                type="button"
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/20 hover:text-slate-100"
                onClick={clearQueue}
              >
                Clear
              </button>
            </div>

            <div className="max-h-64 divide-y divide-white/10 overflow-auto">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate text-slate-200">{file.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {fileKindLabel(file)} · {formatBytes(file.size)}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-rose-200/30 hover:text-rose-100"
                    onClick={() => removeFile(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isUploading}
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-wait disabled:opacity-70"
            onClick={submit}
          >
            {uploadButtonLabel}
          </button>

          <Link
            href="/download"
            className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Download Watcher
          </Link>
        </div>

        {status && (
          <p className="mt-5 text-sm text-slate-300">
            {status}
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
            <div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.28em] text-white/45">
              Upload results
            </div>

            <div className="divide-y divide-white/10">
              {results.slice(0, 20).map((result, index) => (
                <div
                  key={`${result.sourceFile || result.filename || "replay"}-${index}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <span className="block truncate text-slate-200">
                      {result.filename || result.sourceFile || "Replay"}
                    </span>
                    {result.sourceFile && result.sourceFile !== result.filename && (
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                        from {result.sourceFile}
                      </span>
                    )}
                  </div>

                  <span
                    className={
                      !result.ok
                        ? "shrink-0 text-rose-300"
                        : normalizeUploadReceipt(result).resultReady
                          ? "shrink-0 text-emerald-300"
                          : "shrink-0 text-sky-300"
                    }
                  >
                    {uploadReceiptLabel(result)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ReplayVaultReleaseStamp />
    </>
  );

  return (
    <div
      className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-start px-4 pt-24 pb-16 text-white md:pt-28 md:pb-20"
      onDragEnter={isAuthenticated ? handleDragEnter : undefined}
      onDragOver={isAuthenticated ? handleDragOver : undefined}
      onDragLeave={isAuthenticated ? handleDragLeave : undefined}
      onDrop={isAuthenticated ? handleDrop : undefined}
    >
      {isDraggingFiles && isAuthenticated && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-slate-950/72 px-6 backdrop-blur-md">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-amber-100/30 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_42%),rgba(2,6,23,0.88)] p-10 text-center shadow-[0_0_140px_rgba(251,191,36,0.16)]">
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/70 to-transparent" />
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-amber-100/24 bg-amber-200/[0.08] text-3xl text-amber-100">
              +
            </div>
            <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.42em] text-amber-200/80">
              Replay Vault
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Drop the war files
            </div>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-300">
              ZIP packs, old AoE2 records, and classic HD replay formats will be queued cleanly.
            </p>
          </div>
        </div>
      )}

      {!isAuthenticated ? (
        <>
          <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">
              Replay Upload
            </div>
            <h1 className="mt-3 text-3xl font-semibold">
              Sign in before uploading proof.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Browser uploads and watcher keys are both tied to a signed-in identity now. That keeps replay evidence attached to a real account instead of anonymous guest rows.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <SteamLoginButton className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200" />
              <Link
                href="/"
                className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Back To Lobby
              </Link>
            </div>
          </div>
          <ReplayVaultReleaseStamp />
        </>
      ) : (
        authenticatedBody
      )}
    </div>
  );
}
