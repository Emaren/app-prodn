"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { BookOpenText, FileText, LockKeyhole, Trash2, UploadCloud } from "lucide-react";

type ProfileDocument = {
  id: number;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string;
};

type ProfileDocumentResponse = {
  ownerUid: string;
  ownerName: string;
  canUpload: boolean;
  canManage: boolean;
  documents: ProfileDocument[];
};

const ACCEPT = ".pdf,.doc,.docx,.odt,.txt,.md,.rtf,.xls,.xlsx,.ppt,.pptx";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function ProfileDocumentVault() {
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/profile-documents", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load profile documents.");
      const payload = (await response.json()) as ProfileDocumentResponse;
      setDocuments(Array.isArray(payload.documents) ? payload.documents : []);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = useCallback(async (file: File | null) => {
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/profile-documents", { method: "POST", body: form });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      if (!response.ok) throw new Error(payload.detail || `Upload failed (${response.status}).`);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [load, uploading]);

  const remove = useCallback(async (document: ProfileDocument) => {
    if (!window.confirm(`Remove ${document.name} from your War Archive?`)) return;
    const response = await fetch(document.downloadUrl, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      setError(payload.detail || "Could not remove document.");
      return;
    }
    setDocuments((current) => current.filter((row) => row.id !== document.id));
  }, []);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    void upload(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <section className="mt-3 overflow-hidden rounded-[1.5rem] border border-amber-200/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.13),transparent_38%),linear-gradient(145deg,rgba(19,15,9,0.86),rgba(5,10,18,0.92))] p-3.5 shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.28em] text-amber-100/65">
            <BookOpenText className="h-3.5 w-3.5" />
            War Archive
          </div>
          <div className="mt-1 text-sm font-black text-white">Field Documents</div>
          <div className="mt-0.5 text-[10px] leading-4 text-slate-400">Guides · build orders · notes</div>
        </div>
        <span className="rounded-full border border-amber-100/12 bg-amber-300/8 px-2 py-1 text-[9px] font-bold text-amber-100/70">
          {documents.length}
        </span>
      </div>

      <div
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
        onDrop={onDrop}
        className={`mt-3 rounded-[1.1rem] border border-dashed px-3 py-4 text-center transition ${
          dragActive
            ? "border-amber-200/70 bg-amber-300/14"
            : "border-amber-100/18 bg-black/20 hover:border-amber-200/38 hover:bg-amber-300/[0.06]"
        }`}
      >
        <UploadCloud className="mx-auto h-5 w-5 text-amber-200/80" />
        <div className="mt-2 text-xs font-semibold text-white">
          {uploading ? "Uploading to your archive…" : "Drop a document here"}
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-300/18 disabled:opacity-50"
        >
          Browse files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            void upload(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <div className="mt-2 text-[9px] text-slate-500">PDF · Office · text · 25 MB max</div>
      </div>

      {error ? (
        <div className="mt-2 rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-[10px] leading-4 text-rose-100">{error}</div>
      ) : null}

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="text-[10px] text-slate-500">Opening archive…</div>
        ) : documents.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5 text-[10px] leading-4 text-slate-500">
            Your first guide will appear here.
          </div>
        ) : (
          documents.slice(0, 5).map((document) => (
            <div key={document.id} className="group flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5 transition hover:border-amber-200/18 hover:bg-amber-300/[0.05]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-black/24 text-amber-100/80">
                <FileText className="h-4 w-4" />
              </span>
              <a href={document.downloadUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-white/90">{document.name}</div>
                <div className="mt-0.5 text-[9px] text-slate-500">{formatBytes(document.sizeBytes)} · {formatDate(document.createdAt)}</div>
              </a>
              <button
                type="button"
                onClick={() => void remove(document)}
                className="rounded-lg p-1.5 text-slate-600 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-200 group-hover:opacity-100"
                aria-label={`Remove ${document.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[9px] text-slate-500">
        <LockKeyhole className="h-3 w-3" />
        Private to you and AoE2WAR admins.
      </div>
    </section>
  );
}
