"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/hooks/useUserAuth";

type DirectoryEntryHandle = {
  kind: "file" | "directory";
  getFile?: () => Promise<File>;
};

type DirectoryHandleLike = {
  entries: () => AsyncIterable<[string, DirectoryEntryHandle]>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: () => Promise<DirectoryHandleLike>;
};

export default function ReplayParserPage() {
  const { isAuthenticated } = useUserAuth();
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const [watching, setWatching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestHashRef = useRef("");
  const stableCountRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const digestSha1 = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  };

  const handleSelectReplay = async () => {
    try {
      const picker = (window as PickerWindow).showDirectoryPicker;
      if (picker) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }

        setStatus("Opening folder picker...");
        const dirHandle = await picker();

        latestHashRef.current = "";
        stableCountRef.current = 0;
        const MIN_SIZE = 150_000;
        const MAX_STABLE = 3;
        const POLL_INTERVAL = 10_000;

        setWatching(true);
        setStatus("Watching folder for new replays...");

        pollTimerRef.current = setInterval(async () => {
          let latestFile: File | null = null;
          let latestModified = 0;

          for await (const [name, handle] of dirHandle.entries()) {
            const isReplay =
              name.endsWith(".aoe2record") ||
              name.endsWith(".aoe2mpgame") ||
              name.endsWith(".mgz") ||
              name.endsWith(".mgx") ||
              name.endsWith(".mgl");
            if (isReplay && handle.kind === "file" && handle.getFile) {
              const file = await handle.getFile();
              if (file.lastModified > latestModified) {
                latestModified = file.lastModified;
                latestFile = file;
              }
            }
          }

          if (!latestFile) return;

          const hash = await digestSha1(latestFile);
          if (hash === latestHashRef.current) {
            stableCountRef.current += 1;
          } else {
            latestHashRef.current = hash;
            stableCountRef.current = 0;
          }

          if (stableCountRef.current >= MAX_STABLE && latestFile.size >= MIN_SIZE) {
            setFileName(latestFile.name);
            setStatus(`✅ File ready: ${latestFile.name}. Uploading...`);
            await uploadReplayFile(latestFile);
            latestHashRef.current = "";
            stableCountRef.current = 0;
          }
        }, POLL_INTERVAL);
      } else {
        setWatching(false);
        fileInputRef.current?.click();
      }
    } catch (err) {
      console.error(err);
      setWatching(false);
      setStatus("Error selecting file or folder.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadReplayFile(file);
  };

  const uploadReplayFile = async (file: File) => {
    if (!isAuthenticated) {
      setStatus("❌ Sign in with Steam before uploading replays.");
      return;
    }

    setFileName(file.name);
    setStatus(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/replay/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        setStatus(`✅ Parsed: ${file.name}${payload.message ? ` (${payload.message})` : ""}`);
      } else {
        const msg = await res.text();
        setStatus(`❌ Error: ${msg}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Upload failed.");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Replay Watcher</div>
          <h1 className="mt-3 text-3xl font-semibold">Sign in before you connect the watcher.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
            The watcher should be tied to a real account, not an anonymous session. That makes replay uploads useful as betting evidence and identity proof.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <SteamLoginButton
              returnTo="/profile?watcher_pair=1"
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            />
            <Link
              href="/profile?watcher_pair=1"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Open Profile Pairing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">Replay Parser</h1>
      <p>
        Select your SaveGame folder (Chrome/Edge) or upload a replay file manually
        (<code>.aoe2record</code>, <code>.aoe2mpgame</code>, <code>.mgz</code>, <code>.mgx</code>,{" "}
        <code>.mgl</code>) on Safari/Firefox. If using a folder, the most recent replay will auto-upload
        after each match.
      </p>

      <button
        onClick={handleSelectReplay}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        {watching ? "Re-select Replay Folder" : "Select Replay Folder or File"}
      </button>

        <input
          type="file"
          accept=".aoe2record,.aoe2mpgame,.mgz,.mgx,.mgl,application/octet-stream,*/*"
          ref={fileInputRef}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

      <a href="/download" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-block mt-6">
        ⬇️ Download AoE2 Watcher
      </a>

      <Button
        className="mt-4 text-lg text-gray-400 hover:text-white"
        onClick={() => router.push("/")}
      >
        ← Back to Home
      </Button>

      {fileName && <p className="text-sm text-gray-600">Selected: {fileName}</p>}
      {status && <p className="text-sm mt-2">{status}</p>}
    </div>
  );
}
