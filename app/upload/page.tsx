"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function UploadReplay() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");

  const getUidForUpload = () => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("uid") : null;
    if (stored) return stored;
    const generated = `guest-${crypto.randomUUID()}`;
    if (typeof window !== "undefined") {
      localStorage.setItem("uid", generated);
    }
    return generated;
  };

  const submit = async () => {
    if (!selectedFile) {
      setStatus("Choose a replay file first.");
      return;
    }

    const uid = getUidForUpload();
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ".";
    const formData = new FormData();
    formData.append("file", selectedFile);
    setStatus(`Uploading ${selectedFile.name}...`);

    try {
      const response = await fetch(`${API_BASE}/api/replay/upload`, {
        method: "POST",
        headers: { "x-user-uid": uid },
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
