"use client";

import { useEffect, useState } from "react";
import { BookOpenText, FileText, LockKeyhole } from "lucide-react";

type DocumentRow = {
  id: number;
  name: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
};

type Payload = {
  ownerName: string;
  canManage: boolean;
  documents: DocumentRow[];
};

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PlayerProfileDocumentShelf({ uid }: { uid: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/profile-documents?uid=${encodeURIComponent(uid)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) return null;
        if (!response.ok) throw new Error("Profile document shelf unavailable");
        return (await response.json()) as Payload;
      })
      .then((next) => {
        if (!cancelled) setPayload(next);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => { cancelled = true; };
  }, [uid]);

  if (!payload) return null;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-amber-200/14 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_38%),linear-gradient(145deg,rgba(12,13,18,0.94),rgba(3,8,16,0.96))] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-100/58">
            <BookOpenText className="h-4 w-4" />
            War Archive
          </div>
          <h2 className="mt-2 text-xl font-semibold text-white">Field documents</h2>
        </div>
        <span className="rounded-full border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[10px] text-slate-400">{payload.documents.length}</span>
      </div>

      <div className="mt-4 space-y-2">
        {payload.documents.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3 text-xs text-slate-500">No documents uploaded yet.</div>
        ) : payload.documents.map((document) => (
          <a
            key={document.id}
            href={document.downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 transition hover:border-amber-200/20 hover:bg-amber-300/[0.055]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-black/25 text-amber-100/80"><FileText className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white/90">{document.name}</span>
              <span className="mt-0.5 block text-[10px] text-slate-500">{formatBytes(document.sizeBytes)}</span>
            </span>
          </a>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> Owner + AoE2WAR admin access</div>
    </section>
  );
}
