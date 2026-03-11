"use client";

import { useState } from "react";
import Link from "next/link";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/hooks/useUserAuth";

export default function UploadReplay() {
  const { isAuthenticated } = useUserAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  const submit = async () => {
    if (!selectedFile) {
      setStatus("Choose a replay file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    setStatus(`Uploading ${selectedFile.name}...`);

    try {
      const response = await fetch("/api/replay/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        message?: string;
      };

      if (!response.ok) {
        setStatus(payload.detail || payload.message || "Upload failed.");
        return;
      }

      setStatus(payload.message || `Replay uploaded: ${selectedFile.name}`);
    } catch (error) {
      console.error(error);
      setStatus("Upload failed due to network or server error.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
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
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-10 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-white/45">Replay Upload</div>
        <h1 className="mt-3 text-3xl font-semibold">Upload a replay manually</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Manual upload is useful while you set up the watcher. Once the watcher is installed, use a minted watcher key so uploads can reinforce identity trust automatically.
        </p>

        <input
          type="file"
          accept=".aoe2record,.aoe2mpgame,.mgz,.mgx,.mgl"
          className="mt-6 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-sm text-white"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            onClick={submit}
          >
            Upload Replay
          </button>
          <Link
            href="/download"
            className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Download Watcher
          </Link>
        </div>

        {status && <p className="mt-5 text-sm text-slate-300">{status}</p>}
      </div>
    </div>
  );
}
