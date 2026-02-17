"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function UploadReplay() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  const ensureSession = async () => {
    const existingEmail =
      typeof window !== "undefined" ? localStorage.getItem("userEmail") : null;
    const fallbackEmail = existingEmail || `guest-${crypto.randomUUID()}@aoe2hdbets.local`;
    if (typeof window !== "undefined" && !existingEmail) {
      localStorage.setItem("userEmail", fallbackEmail);
    }

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fallbackEmail }),
    });
    return response.ok;
  };

  const submit = async () => {
    if (!selectedFile) {
      setStatus("Choose a replay file first.");
      return;
    }

    const hasSession = await ensureSession();
    if (!hasSession) {
      setStatus("Unable to initialize session. Try refreshing and retrying.");
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
      if (!response.ok) {
        const err = await response.text();
        setStatus(`Upload failed: ${err}`);
        return;
      }
      setStatus(`Replay uploaded: ${selectedFile.name}`);
    } catch (error) {
      console.error(error);
      setStatus("Upload failed due to network or server error.");
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white px-6">
      <div className="w-full max-w-lg flex flex-col items-center space-y-6">
        <h1 className="text-4xl font-bold">Upload Replay</h1>
        <Input
          type="file"
          accept=".aoe2record,.aoe2mpgame,.mgz,.mgx,.mgl"
          className="w-full text-black bg-white px-4 py-3 rounded-md"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
        <Button className="w-full text-xl bg-blue-600 hover:bg-blue-700 py-4" onClick={submit}>
          Submit
        </Button>

        <a href="/download" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg mt-6 inline-block">
          ⬇️ Download AoE2 Watcher
        </a>

        <Button
          className="mt-4 text-lg text-gray-400 hover:text-white"
          onClick={() => router.push("/")}
        >
          ← Back to Home
        </Button>

        {status && <p className="text-sm text-gray-300">{status}</p>}
      </div>
    </div>
  );
}
