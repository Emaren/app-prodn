"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ImagePlus, RefreshCw, Shield, XCircle } from "lucide-react";

type ManagedMediaAsset = {
  id: number;
  key: string;
  kind: string;
  target: string | null;
  label: string;
  url: string;
  alt: string | null;
  mimeType: string | null;
  originalName: string | null;
  sizeBytes: number;
  active: boolean;
  uploadedByUid: string | null;
  createdAt: string;
  updatedAt: string;
};

const KIND_OPTIONS = ["avatar", "belt", "artifact", "logo", "background", "other"] as const;

const TARGET_HINTS: Record<string, string[]> = {
  avatar: ["sniper", "jim", "julio-alvarez", "emaren", "silhouette"],
  belt: [
    "world",
    "chaos",
    "womens",
    "tag-team",
    "national-usa",
    "national-mexico",
    "national-uk",
    "national-canada",
    "elo-rising",
    "elo-challenger",
    "elo-veteran",
    "elo-elite",
    "elo-legend",
  ],
  artifact: [
    "designation-giant-killer",
    "designation-comeback-king",
    "designation-siege-lord",
    "designation-silent-killer",
    "designation-raid-demon",
    "designation-boom-lord",
  ],
  logo: ["footer-wolo"],
  background: ["lobby-extreme", "champions-hero"],
  other: ["promo"],
};

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminMediaAssetsPage() {
  const [assets, setAssets] = useState<ManagedMediaAsset[]>([]);
  const [kind, setKind] = useState<(typeof KIND_OPTIONS)[number]>("avatar");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [alt, setAlt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hints = TARGET_HINTS[kind] ?? [];
  const activeAssets = useMemo(() => assets.filter((asset) => asset.active), [assets]);

  async function loadAssets() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/media-assets", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as
        | { assets?: ManagedMediaAsset[]; detail?: string }
        | Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Could not load media assets.");
      }
      setAssets(Array.isArray(payload.assets) ? payload.assets : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load media assets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    if (nextFile && !label.trim()) {
      setLabel(nextFile.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    }
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose an image file first.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const body = new FormData();
      body.set("kind", kind);
      body.set("target", target);
      body.set("label", label || target || file.name);
      body.set("alt", alt);
      body.set("file", file);

      const response = await fetch("/api/admin/media-assets", {
        method: "POST",
        body,
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { asset?: ManagedMediaAsset; detail?: string }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Upload failed.");
      }

      setFile(null);
      setLabel("");
      setAlt("");
      setNotice("Asset uploaded and activated.");
      await loadAssets();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  async function setAssetActive(asset: ManagedMediaAsset, active: boolean) {
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/media-assets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asset.id, active }),
      });
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };

      if (!response.ok) {
        throw new Error(payload.detail || "Asset update failed.");
      }

      setNotice(active ? `${asset.label} activated.` : `${asset.label} deactivated.`);
      await loadAssets();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Asset update failed.");
    }
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-white sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-amber-100/65">Admin Armory</div>
          <h1 className="mt-2 text-3xl font-semibold">Media assets</h1>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-slate-200 transition hover:border-amber-200/35 hover:text-amber-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(19rem,0.36fr)_minmax(0,1fr)]">
        <form
          onSubmit={submitUpload}
          className="rounded-[1.6rem] border border-amber-200/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] lg:sticky lg:top-24 lg:self-start"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-100/70">
            <ImagePlus className="h-4 w-4" />
            Upload
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-200">Kind</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as (typeof KIND_OPTIONS)[number])}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              >
                {KIND_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-200">Target</span>
              <input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="sniper, world, footer-wolo..."
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-300/40"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {hints.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => setTarget(hint)}
                  className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs text-slate-300 transition hover:border-amber-200/30 hover:text-amber-100"
                >
                  {hint}
                </button>
              ))}
            </div>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-200">Label</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-slate-200">Alt text</span>
              <input
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/40"
              />
            </label>

            <label className="grid gap-2 rounded-2xl border border-dashed border-amber-200/18 bg-black/20 px-4 py-5">
              <span className="text-sm font-semibold text-slate-200">Image file</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseFile} />
              <span className="text-xs text-slate-500">{file ? `${file.name} · ${formatSize(file.size)}` : "PNG, JPG, WEBP, or GIF under 7 MB."}</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Uploading..." : "Upload + Activate"}
            </button>
          </div>
        </form>

        <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-sky-100/60">
              <Shield className="h-4 w-4" />
              Active swaps
            </div>
            <button
              type="button"
              onClick={() => void loadAssets()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-200/30 hover:text-sky-100 disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {notice ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/18 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="mt-4 rounded-2xl border border-red-300/18 bg-red-400/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {(loading ? [] : activeAssets).map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSetActive={(nextActive) => void setAssetActive(asset, nextActive)}
              />
            ))}
            {!loading && activeAssets.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-300">
                No active managed assets yet.
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/50 p-5 sm:p-6">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">All uploads</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onSetActive={(nextActive) => void setAssetActive(asset, nextActive)}
            />
          ))}
          {!loading && assets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-300">
              No uploads yet.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function AssetCard({
  asset,
  onSetActive,
}: {
  asset: ManagedMediaAsset;
  onSetActive: (active: boolean) => void;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] shadow-[0_18px_54px_rgba(0,0,0,0.18)]">
      <div className="relative flex aspect-[1.55/1] items-center justify-center bg-[linear-gradient(45deg,rgba(255,255,255,0.045)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.045)_75%),linear-gradient(45deg,rgba(255,255,255,0.045)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.045)_75%)] bg-[length:18px_18px] bg-[position:0_0,9px_9px]">
        <img src={asset.url} alt={asset.alt || asset.label} className="h-full w-full object-contain p-2" />
        <div className="pointer-events-none absolute inset-0 bg-black/34" />
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
            asset.active
              ? "border-emerald-300/24 bg-emerald-400/12 text-emerald-100"
              : "border-white/10 bg-black/36 text-slate-400"
          }`}
        >
          {asset.active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {asset.active ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-white">{asset.label}</div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {asset.kind}
          {asset.target ? ` / ${asset.target}` : ""} · {formatSize(asset.sizeBytes)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSetActive(!asset.active)}
            className="rounded-full border border-amber-200/16 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10"
          >
            {asset.active ? "Deactivate" : "Activate"}
          </button>
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/24 hover:text-white"
          >
            Open
          </a>
        </div>
      </div>
    </article>
  );
}
