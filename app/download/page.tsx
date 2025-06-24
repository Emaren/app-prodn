"use client";

import { ArrowDownToLine } from "lucide-react";
import Link from "next/link";

export default function DownloadPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white px-6">
      <h1 className="text-4xl font-bold mb-6 text-center">Download AoE2 Companion App</h1>

      <p className="text-lg text-gray-300 mb-4 max-w-xl text-center">
        To automatically detect and upload your replays for betting, install the small companion app.
        It watches your SaveGame folder and securely sends replays to our backend.
      </p>

      <div className="mt-4">
        <Link
          href="/downloads/aoe2-watcher-mac.zip"
          className="inline-flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow-md"
          download
        >
          <ArrowDownToLine className="w-6 h-6" />
          Download for macOS
        </Link>
      </div>

      <p className="text-sm text-gray-400 mt-6">
        Windows version coming soon. Works best with AoE2 HD via Steam and CrossOver.
      </p>
    </div>
  );
}
