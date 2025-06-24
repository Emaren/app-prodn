"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function ReplayParserPage() {
  const [status, setStatus] = useState("");
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleSelectReplay = async () => {
    try {
      if ("showDirectoryPicker" in window) {
        setStatus("Opening folder picker...");
        const dirHandle = await (window as any).showDirectoryPicker();

        let lastHash = "";
        let stableCount = 0;
        const MIN_SIZE = 150_000;
        const MAX_STABLE = 3;
        const POLL_INTERVAL = 10_000;

        setStatus("Watching folder for new replays...");

        setInterval(async () => {
          let latestFile: File | null = null;
          let latestModified = 0;

          for await (const [name, handle] of dirHandle.entries()) {
            if (name.endsWith(".aoe2record") && handle.kind === "file") {
              const file = await handle.getFile();
              if (file.lastModified > latestModified) {
                latestModified = file.lastModified;
                latestFile = file;
              }
            }
          }

          if (!latestFile) return;

          const buffer = await latestFile.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest("SHA-1", buffer);
          const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          if (hash === lastHash) {
            stableCount++;
          } else {
            lastHash = hash;
            stableCount = 0;
          }

          if (stableCount >= MAX_STABLE && latestFile.size >= MIN_SIZE) {
            setFileName(latestFile.name);
            setStatus(`✅ File ready: ${latestFile.name}. Uploading...`);
            await uploadReplayFile(latestFile);
            lastHash = ""; // prevent reupload
            stableCount = 0;
          }
        }, POLL_INTERVAL);
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      console.error(err);
      setStatus("Error selecting file or folder.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadReplayFile(file);
  };

  const uploadReplayFile = async (file: File) => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8002";
    setFileName(file.name);
    setStatus(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/parse_replay`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setStatus(`✅ Parsed: ${file.name}`);
      } else {
        const msg = await res.text();
        setStatus(`❌ Error: ${msg}`);
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Upload failed.");
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">Replay Parser</h1>
      <p>
        Select your SaveGame folder (Chrome/Edge) or upload a <code>.aoe2record</code> file manually
        (Safari/Firefox). If using a folder, the most recent replay will auto-upload after each match.
      </p>

      <button
        onClick={handleSelectReplay}
        className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
      >
        Select Replay Folder or File
      </button>

      <input
        type="file"
        accept=".aoe2record,application/octet-stream,*/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <a
        href="https://drive.google.com/uc?export=download&id=1c-e3Qt9RrSCZVXciUbvmGEbGxH1Nt5NQ"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-block mt-6"
      >
        ⬇️ Download AoE2 Watcher for macOS (Universal)
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
