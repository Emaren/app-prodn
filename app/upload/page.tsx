"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

export default function UploadReplay() {
  const router = useRouter();

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white px-6">
      <div className="w-full max-w-lg flex flex-col items-center space-y-6">
        <h1 className="text-4xl font-bold">Upload Replay</h1>
        <Input type="file" className="w-full text-black bg-white px-4 py-3 rounded-md" />
        <Button className="w-full text-xl bg-blue-600 hover:bg-blue-700 py-4">
          Submit
        </Button>

        <a
          href="https://drive.google.com/uc?export=download&id=1c-e3Qt9RrSCZVXciUbvmGEbGxH1Nt5NQ"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg mt-6 inline-block"
        >
          ⬇️ Download AoE2 Watcher for macOS (Universal)
        </a>

        <Button
          className="mt-4 text-lg text-gray-400 hover:text-white"
          onClick={() => router.push("/")}
        >
          ← Back to Home
        </Button>
      </div>
    </div>
  );
}
