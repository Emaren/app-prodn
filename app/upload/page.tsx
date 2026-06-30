"use client";

import { useState } from "react";
import Link from "next/link";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/hooks/useUserAuth";

type UploadResult = {
  filename?: string;
  ok?: boolean;
  status?: number;
  message?: string;
  detail?: string;
};

function isReplayPack(file: File | null) {
  return Boolean(file?.name.toLowerCase().endsWith(".zip"));
}

function ReplayVaultReleaseStamp() {
  return (
    <aside className="mx-auto mt-8 w-full max-w-3xl">
      <div className="ml-auto max-w-sm rounded-[1.6rem] border border-white/10 bg-slate-950/35 px-5 py-4 text-right shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur">
        <div className="text-[10px] font-semibold uppercase tracking-[0.38em] text-amber-200/70">
          Released
        </div>
        <div className="mt-2 text-xl font-semibold tracking-tight text-white">
          Replay Vault v1.1
        </div>
        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          Jun 30, 2026
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-300">
          ZIP packs live · renamed files preserved · old wars documented.
        </p>
      </div>
    </aside>
  );
}

export default function UploadReplay() {
  const { isAuthenticated } = useUserAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<UploadResult[]>([]);

  const selectedIsPack = isReplayPack(selectedFile);

  const submit = async () => {
    if (!selectedFile) {
      setStatus("Choose a replay file or ZIP pack first.");
      setResults([]);
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    const endpoint = selectedIsPack ? "/api/replay/upload-package" : "/api/replay/upload";
    setStatus(
      selectedIsPack
        ? `Importing replay pack ${selectedFile.name}...`
        : `Uploading ${selectedFile.name}...`
    );
    setResults([]);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        message?: string;
        results?: UploadResult[];
      };

      if (!response.ok) {
        setStatus(payload.detail || payload.message || "Upload failed.");
        setResults(Array.isArray(payload.results) ? payload.results : []);
        return;
      }

      setStatus(payload.message || `Replay uploaded: ${selectedFile.name}`);
      setResults(Array.isArray(payload.results) ? payload.results : []);
    } catch (error) {
      console.error(error);
      setStatus("Upload failed due to network or server error.");
      setResults([]);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center px-4 pt-20 pb-80 text-white">
        <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Replay Upload</div>
          <h1 className="mt-3 text-3xl font-semibold">Sign in before uploading proof.</h1>
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
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center px-4 pt-20 pb-80 text-white">
      <div className="mx-auto w-full max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-white/45">Replay Upload</div>
        <h1 className="mt-3 text-3xl font-semibold">Upload a replay manually</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Upload one replay as before, or import an old-school ZIP pack of renamed wars. The watcher is still best for live proof; this vault keeps old battles useful.
        </p>

        <input
          type="file"
          accept=".aoe2record,.aoe2mpgame,.mgz,.mgx,.mgl,.zip"
          className="mt-6 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-sm text-white"
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] || null);
            setStatus("");
            setResults([]);
          }}
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            onClick={submit}
          >
            {selectedIsPack ? "Import Replay Pack" : "Upload Replay"}
          </button>
          <Link
            href="/download"
            className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Download Watcher
          </Link>
        </div>

        {selectedFile && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-5 text-slate-400">
            {selectedIsPack
              ? "ZIP pack detected. Replays inside the archive will be imported one by one and their renamed filenames will be preserved."
              : "Single replay detected. Uploads remain tied to your signed-in AoE2WAR identity."}
          </div>
        )}
{status && <p className="mt-5 text-sm text-slate-300">{status}</p>}

        {results.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
            <div className="border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.28em] text-white/45">
              Pack results
            </div>
            <div className="divide-y divide-white/10">
              {results.slice(0, 12).map((result, index) => (
                <div key={`${result.filename || "replay"}-${index}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <span className="truncate text-slate-200">{result.filename || "Replay"}</span>
                  <span className={result.ok ? "text-emerald-300" : "text-rose-300"}>
                    {result.ok ? "uploaded" : result.detail || result.message || "failed"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <ReplayVaultReleaseStamp />
    </div>
  );
}
