"use client";

import { ArrowDownToLine } from "lucide-react";
import Link from "next/link";

export default function DownloadPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white px-6">
      <h1 className="text-4xl font-bold mb-6 text-center">Download AoE2 Watcher</h1>

      <p className="text-lg text-gray-300 mb-4 max-w-xl text-center">
        To automatically detect and upload your replays for betting, run the companion watcher.
        This package is Firebase-free and uploads directly to AoE2HDBets.
      </p>

      <div className="mt-4">
        <Link
          href="/downloads/aoe2-watcher-mac.zip"
          className="inline-flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg text-lg font-semibold shadow-md"
          download
        >
          <ArrowDownToLine className="w-6 h-6" />
          Download Watcher Package
        </Link>
      </div>

      <div className="text-sm text-gray-400 mt-6 text-center max-w-2xl space-y-2">
        <p>Setup: unzip, run <code>cp .env.example .env</code>, then <code>npm install</code> and <code>npm run start</code>.</p>
        <p>If uploads are protected on backend, set <code>AOE2_UPLOAD_API_KEY</code> in your <code>.env</code>.</p>
        <p>Default upload host is <code>https://api-prodn.aoe2hdbets.com</code>.</p>
        <p>Works best with AoE2 HD via Steam and CrossOver.</p>
      </div>
    </div>
  );
}
