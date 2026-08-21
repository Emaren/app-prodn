"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import SystemMessageMediaStudio from "@/components/admin/media/SystemMessageMediaStudio";

import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  ImagePlus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  UserRound,
  XCircle,
} from "lucide-react";

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

type AdminMediaUser = {
  id: number;
  key: string;
  source: "user" | "replay";
  uid: string | null;
  displayName: string;
  email: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  walletAddress: string | null;
  representedCountry: string | null;
  genderDivision: string | null;
  createdAt: string;
  lastSeen: string | null;
  avatarPreviewUrl: string;
  steamId?: string | null;
  aliases?: string[];
  totalMatches?: number;
};

const KIND_OPTIONS = ["avatar", "crest", "hero", "belt", "artifact", "logo", "background", "motion", "other"] as const;
type MediaKind = (typeof KIND_OPTIONS)[number];

const COUNTRY_OPTIONS = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Bahamas",
  "Bangladesh",
  "Belarus",
  "Belgium",
  "Bolivia",
  "Brazil",
  "Bulgaria",
  "Cambodia",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Croatia",
  "Czech Republic",
  "Denmark",
  "Ecuador",
  "Egypt",
  "England",
  "Finland",
  "France",
  "Georgia",
  "Germany",
  "Greece",
  "Hong Kong",
  "Hungary",
  "India",
  "Indonesia",
  "Iran",
  "Ireland",
  "Israel",
  "Italy",
  "Japan",
  "Kazakhstan",
  "Kosovo",
  "Laos",
  "Malaysia",
  "Mexico",
  "Mongolia",
  "Morocco",
  "Netherlands",
  "New Zealand",
  "Norway",
  "Pakistan",
  "Palestine",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Romania",
  "Russia",
  "Scotland",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "South Africa",
  "South Korea",
  "Spain",
  "Sweden",
  "Switzerland",
  "Taiwan",
  "Thailand",
  "Turkey",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam",
  "Wales",
] as const;

const CATEGORY_LABELS: Record<MediaKind, string> = {
  avatar: "Avatars",
  crest: "Clan Crests",
  hero: "Hero Images",
  belt: "Belts",
  artifact: "Artifacts",
  logo: "Logos",
  background: "Backgrounds",
  motion: "Hero Motion",
  other: "Other",
};

function cleanFilenameLabel(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function isUserTarget(target: string | null | undefined) {
  return Boolean(target?.startsWith("user-"));
}

function normalizeMediaTarget(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function poolTargetFor(uid: string) {
  return normalizeMediaTarget(
    `user-${uid}-pool`
  );
}

function currentTargetFor(uid: string) {
  return normalizeMediaTarget(
    `user-${uid}`
  );
}

function featuredTargetFor(uid: string) {
  return normalizeMediaTarget(
    `user-${uid}-featured`
  );
}

function assetBelongsToUser(
  asset: ManagedMediaAsset,
  uid: string
) {
  return (
    asset.target === poolTargetFor(uid) ||
    asset.target === currentTargetFor(uid)
  );
}

function avatarSourceLabel(
  asset: ManagedMediaAsset,
  uid: string
) {
  if (asset.target === poolTargetFor(uid)) {
    return "AoE2WAR avatar";
  }

  if (
    asset.target === currentTargetFor(uid) &&
    asset.originalName &&
    asset.sizeBytes > 0 &&
    asset.uploadedByUid === uid
  ) {
    return "Personal upload";
  }

  return "Profile history";
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function searchBlob(asset: ManagedMediaAsset) {
  return [
    asset.label,
    asset.kind,
    asset.target || "",
    asset.originalName || "",
    asset.alt || "",
    asset.url,
  ]
    .join(" ")
    .toLowerCase();
}

function userSubline(user: AdminMediaUser) {
  const parts = [
    user.uid ? "registered" : "tracked",
    user.representedCountry || "",
    typeof user.totalMatches === "number" ? `${user.totalMatches} matches` : "",
  ].filter(Boolean);

  return parts.join(" · ");
}

export default function AdminMediaAssetsPage() {
  const [assets, setAssets] = useState<ManagedMediaAsset[]>([]);
  const [users, setUsers] = useState<AdminMediaUser[]>([]);

  const [category, setCategory] = useState<MediaKind>("avatar");
  const [assetQuery, setAssetQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUserUid, setSelectedUserUid] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [representedCountryDraft, setRepresentedCountryDraft] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [uploadLabel, setUploadLabel] = useState("");

  const [loadingAssets, setLoadingAssets] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [materializingUserKey, setMaterializingUserKey] = useState<string | null>(null);
  const [busyAssetId, setBusyAssetId] = useState<number | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedUser = useMemo(
    () => users.find((user) => user.uid === selectedUserUid) || null,
    [selectedUserUid, users]
  );

  useEffect(() => {
    setRepresentedCountryDraft(
      selectedUser?.representedCountry || ""
    );
  }, [
    selectedUser?.representedCountry,
    selectedUserUid,
  ]);

  const globalAssets = useMemo(
    () => assets.filter((asset) => asset.kind === category && !isUserTarget(asset.target)),
    [assets, category]
  );

  const visibleAssets = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();

    if (!query) return globalAssets;

    return globalAssets.filter((asset) => searchBlob(asset).includes(query));
  }, [assetQuery, globalAssets]);

  const selectedAssets = useMemo(
    () => globalAssets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [globalAssets, selectedAssetIds]
  );

  const selectedUserAssignments = useMemo(() => {
    if (!selectedUserUid) {
      return [];
    }

    return assets.filter((asset) =>
      assetBelongsToUser(
        asset,
        selectedUserUid
      )
    );
  }, [assets, selectedUserUid]);

  const selectedUserAvatarLibrary = useMemo(() => {
    if (!selectedUserUid) {
      return [];
    }

    const byUrl =
      new Map<string, ManagedMediaAsset>();

    const poolAssets =
      selectedUserAssignments.filter(
        (asset) =>
          asset.kind === "avatar" &&
          asset.target ===
            poolTargetFor(selectedUserUid)
      );

    const profileAssets =
      selectedUserAssignments.filter(
        (asset) =>
          asset.kind === "avatar" &&
          asset.target ===
            currentTargetFor(selectedUserUid)
      );

    for (const asset of poolAssets) {
      if (!byUrl.has(asset.url)) {
        byUrl.set(asset.url, asset);
      }
    }

    for (const asset of profileAssets) {
      if (!byUrl.has(asset.url)) {
        byUrl.set(asset.url, asset);
      }
    }

    return Array.from(byUrl.values());
  }, [
    selectedUserAssignments,
    selectedUserUid,
  ]);

  const selectedUserAssignmentsForCategory =
    useMemo(
      () =>
        category === "avatar"
          ? selectedUserAvatarLibrary
          : selectedUserAssignments.filter(
              (asset) =>
                asset.kind === category
            ),
      [
        category,
        selectedUserAssignments,
        selectedUserAvatarLibrary,
      ]
    );

  const selectedUserProfileAsset = useMemo(() => {
    if (!selectedUserUid) {
      return null;
    }

    return (
      assets.find(
        (asset) =>
          asset.kind === "avatar" &&
          asset.target ===
            currentTargetFor(selectedUserUid) &&
          asset.active
      ) ||
      null
    );
  }, [assets, selectedUserUid]);

  const selectedUserFeaturedAsset = useMemo(() => {
    if (!selectedUserUid) {
      return null;
    }

    return (
      assets.find(
        (asset) =>
          asset.kind === "avatar" &&
          asset.target ===
            featuredTargetFor(selectedUserUid) &&
          asset.active
      ) ||
      null
    );
  }, [assets, selectedUserUid]);

  const categoryStats = useMemo(() => {
    return KIND_OPTIONS.map((kind) => ({
      kind,

      global:
        assets.filter(
          (asset) =>
            asset.kind === kind &&
            !isUserTarget(asset.target)
        ).length,

      assigned:
        kind === "avatar"
          ? selectedUserAvatarLibrary.length
          : selectedUserAssignments.filter(
              (asset) =>
                asset.kind === kind
            ).length,
    }));
  }, [
    assets,
    selectedUserAssignments,
    selectedUserAvatarLibrary,
  ]);

  const totalAssignedForSelectedUser =
    selectedUserAssignments.filter(
      (asset) =>
        asset.kind !== "avatar"
    ).length +
    selectedUserAvatarLibrary.length;

    const totalUploadBytes = files.reduce((sum, file) => sum + file.size, 0);
  const allVisibleSelected = visibleAssets.length > 0 && visibleAssets.every((asset) => selectedAssetIds.includes(asset.id));

  async function loadAssets() {
    setLoadingAssets(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/media-assets", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        assets?: ManagedMediaAsset[];
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not load assets.");
      }

      setAssets(Array.isArray(payload.assets) ? payload.assets : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load assets.");
    } finally {
      setLoadingAssets(false);
    }
  }

  async function loadUsers(query = userQuery) {
    setLoadingUsers(true);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());

      const response = await fetch(`/api/admin/media-assets/users?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        users?: AdminMediaUser[];
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not load warriors.");
      }

      setUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load warriors.");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(userQuery);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [userQuery]);

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files || []);
    setFiles(nextFiles);

    if (nextFiles.length === 1 && !uploadLabel.trim()) {
      setUploadLabel(cleanFilenameLabel(nextFiles[0].name));
    }
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (files.length === 0) {
      setError("Choose one or more image files first.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      let uploaded = 0;

      for (const file of files) {
        const cleanName = cleanFilenameLabel(file.name) || file.name;
        const body = new FormData();

        body.set("kind", category);
        body.set("target", "");
        body.set("label", files.length === 1 ? uploadLabel || cleanName : cleanName);
        body.set("alt", files.length === 1 ? uploadLabel || cleanName : cleanName);
        body.set("file", file);

        const response = await fetch("/api/admin/media-assets", {
          method: "POST",
          body,
        });

        const payload = (await response.json().catch(() => ({}))) as {
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(payload.detail || `Upload failed for ${file.name}.`);
        }

        uploaded += 1;
      }

      setFiles([]);
      setUploadLabel("");
      setNotice(`${uploaded} ${CATEGORY_LABELS[category].toLowerCase()} uploaded.`);
      await loadAssets();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRepresentedCountry() {
    if (!selectedUser?.uid) {
      setError("Choose a registered warrior first.");
      return;
    }

    setSavingIdentity(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/media-assets/user-profile",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            uid: selectedUser.uid,
            displayName: selectedUser.displayName,
            representedCountry:
              representedCountryDraft.trim(),
            genderDivision:
              selectedUser.genderDivision || "Man",
          }),
        }
      );

      const payload =
        (await response.json().catch(() => ({}))) as {
          detail?: string;
          user?: {
            representedCountry?: string | null;
          };
        };

      if (!response.ok) {
        throw new Error(
          payload.detail ||
            "Could not update warrior country."
        );
      }

      setNotice(
        representedCountryDraft.trim()
          ? `${selectedUser.displayName} now represents ${representedCountryDraft.trim()}.`
          : `${selectedUser.displayName}'s represented country was cleared.`
      );

      await loadUsers(userQuery);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not update warrior country."
      );
    } finally {
      setSavingIdentity(false);
    }
  }

  async function selectWarrior(user: AdminMediaUser) {
    if (user.uid) {
      setSelectedUserUid(user.uid);
      return;
    }

    setMaterializingUserKey(user.key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/media-assets/ensure-user", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: user.displayName,
          playerKey: user.key,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        user?: { uid?: string };
        detail?: string;
      };

      if (!response.ok || !payload.user?.uid) {
        throw new Error(payload.detail || "Could not create managed warrior.");
      }

      setSelectedUserUid(payload.user.uid);
      setNotice(`${user.displayName} added as a managed warrior.`);
      await loadUsers(userQuery);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "Could not select warrior.");
    } finally {
      setMaterializingUserKey(null);
    }
  }

  function toggleAsset(assetId: number) {
    setSelectedAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]
    );
  }

  function toggleVisibleAssets() {
    if (allVisibleSelected) {
      setSelectedAssetIds((current) => current.filter((id) => !visibleAssets.some((asset) => asset.id === id)));
      return;
    }

    setSelectedAssetIds((current) => Array.from(new Set([...current, ...visibleAssets.map((asset) => asset.id)])));
  }

  async function assignSelectedAssets() {
    if (!selectedUserUid) {
      setError("Choose a warrior first.");
      return;
    }

    if (selectedAssets.length === 0) {
      setError("Select one or more assets first.");
      return;
    }

    setAssigning(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/media-assets/assign-user-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uid: selectedUserUid,
          assetIds: selectedAssets.map((asset) => asset.id),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        assignedCount?: number;
        detail?: string;
        user?: { displayName?: string };
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not assign assets.");
      }

      setSelectedAssetIds([]);
      setNotice(
        `${payload.assignedCount || selectedAssets.length} asset${(payload.assignedCount || selectedAssets.length) === 1 ? "" : "s"} assigned to ${
          payload.user?.displayName || selectedUser?.displayName || "warrior"
        }.`
      );
      await Promise.all([loadAssets(), loadUsers(userQuery)]);
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign assets.");
    } finally {
      setAssigning(false);
    }
  }

  async function setAssetActive(asset: ManagedMediaAsset, active: boolean) {
    setBusyAssetId(asset.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/media-assets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asset.id, active }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Asset update failed.");
      }

      setNotice(active ? `${asset.label} activated.` : `${asset.label} deactivated.`);
      await loadAssets();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Asset update failed.");
    } finally {
      setBusyAssetId(null);
    }
  }

  async function setFeaturedAvatar(
    asset: ManagedMediaAsset
  ) {
    if (!selectedUserUid) {
      setError("Choose a warrior first.");
      return;
    }

    setBusyAssetId(asset.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/media-assets/set-user-featured-avatar",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            uid: selectedUserUid,
            assetId: asset.id,
          }),
        }
      );

      const payload =
        (await response.json().catch(() => ({}))) as {
          detail?: string;
          user?: {
            displayName?: string;
          };
        };

      if (!response.ok) {
        throw new Error(
          payload.detail ||
            "Could not set Featured Warrior avatar."
        );
      }

      setNotice(
        `${
          payload.user?.displayName ||
          selectedUser?.displayName ||
          "Warrior"
        } Featured Warrior avatar updated.`
      );

      await Promise.all([
        loadAssets(),
        loadUsers(userQuery),
      ]);
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not set Featured Warrior avatar."
      );
    } finally {
      setBusyAssetId(null);
    }
  }

  async function deleteAsset(asset: ManagedMediaAsset) {
    const confirmed = window.confirm(`Delete "${asset.label}"?`);

    if (!confirmed) return;

    setBusyAssetId(asset.id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/media-assets/${asset.id}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        removedFile?: boolean;
        keptFileBecauseStillReferenced?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Delete failed.");
      }

      setSelectedAssetIds((current) => current.filter((id) => id !== asset.id));
      setNotice(
        payload.keptFileBecauseStillReferenced
          ? `${asset.label} removed. File kept because another asset still uses it.`
          : `${asset.label} removed${payload.removedFile ? " and file deleted" : ""}.`
      );
      await loadAssets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    } finally {
      setBusyAssetId(null);
    }
  }

  return (
    <main className="min-h-screen w-full max-w-none text-white">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.90))] px-6 py-5 shadow-[0_32px_110px_rgba(0,0,0,0.34)]">
        <div>
          <div className="text-xs uppercase tracking-[0.34em] text-amber-100/65">Admin Armory</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Media Manager</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Upload assets once. Reuse them across warriors, clans, and page Hero chains without touching code.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void Promise.all([loadAssets(), loadUsers(userQuery)])}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-amber-200/35 hover:text-amber-100"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            href="/admin/page-heroes"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[0.06] px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/35 hover:bg-cyan-300/10"
          >
            Page Heroes
          </Link>
          <Link
            href="/admin/clans"
            className="inline-flex items-center gap-2 rounded-full border border-red-200/20 bg-red-300/[0.06] px-4 py-2 text-sm font-semibold text-red-100 transition hover:border-red-200/35 hover:bg-red-300/10"
          >
            Clan Command
          </Link>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-amber-200/35 hover:text-amber-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Admin
          </Link>
        </div>
      </header>

      {(notice || error) && (
        <section
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-300/18 bg-red-400/10 text-red-100"
              : "border-emerald-300/18 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {error || notice}
        </section>
      )}

      <nav className="mb-5 grid gap-2 sm:grid-cols-4 xl:grid-cols-9">
        {categoryStats.map((stat) => (
          <button
            key={stat.kind}
            type="button"
            onClick={() => {
              setCategory(stat.kind);
              setSelectedAssetIds([]);
              setAssetQuery("");
            }}
            className={`rounded-[1.15rem] border px-4 py-3 text-left transition ${
              category === stat.kind
                ? "border-amber-200/45 bg-amber-300/12 text-amber-50 shadow-[0_18px_45px_rgba(251,191,36,0.08)]"
                : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:bg-white/[0.055]"
            }`}
          >
            <div className="text-sm font-semibold">{CATEGORY_LABELS[stat.kind]}</div>
            <div className="mt-1 text-xs text-slate-500">
              {stat.global} library · {stat.assigned} assigned
            </div>
          </button>
        ))}
      </nav>

      <SystemMessageMediaStudio />

      <section className="grid w-full min-w-0 gap-5 xl:grid-cols-[21rem_minmax(0,1fr)_30rem] min-[1700px]:grid-cols-[23rem_minmax(0,1fr)_34rem]">
        <aside className="grid min-w-0 gap-5 xl:content-start">
          <form
            onSubmit={submitUpload}
            className="rounded-[1.65rem] border border-amber-200/14 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.26)]"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-amber-100/75">
              <UploadCloud className="h-4 w-4" />
              Upload to library
            </div>

            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/18 px-3 py-3">
                <div className="text-xs text-slate-400">Category</div>
                <div className="mt-1 text-lg font-semibold text-white">{CATEGORY_LABELS[category]}</div>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-slate-200">Optional label</span>
                <input
                  value={uploadLabel}
                  onChange={(event) => setUploadLabel(event.target.value)}
                  placeholder="Leave blank to use file names"
                  className="rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-300/40"
                />
              </label>

              <label className="grid gap-2 rounded-2xl border border-dashed border-amber-200/22 bg-black/24 px-3 py-5">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <ImagePlus className="h-4 w-4" />
                  Files
                </span>
                <input
                  type="file"
                  multiple
                  accept={
                    category === "motion"
                      ? "video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif"
                      : "image/png,image/jpeg,image/webp,image/gif"
                  }
                  onChange={chooseFiles}
                />
                <span className="text-xs text-slate-500">
                  {files.length > 0
                    ? `${files.length} file${files.length === 1 ? "" : "s"} · ${formatSize(totalUploadBytes)}`
                    : category === "motion"
                      ? "MP4 or WEBM up to 48 MB. GIF and still-image fallbacks are also accepted."
                      : "PNG, JPG, WEBP, or GIF. Upload once, assign many times."}
                </span>
              </label>

              <button
                type="submit"
                disabled={saving || files.length === 0}
                className="rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Uploading..." : `Upload ${files.length || ""} asset${files.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </form>

          <section className="rounded-[1.65rem] border border-sky-200/14 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.26)]">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-sky-100/75">
              <UserRound className="h-4 w-4" />
              Warrior
            </div>

            <label className="mt-4 grid gap-2">
              <span className="text-sm font-semibold text-slate-200">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="Julio, Sniper, wallet, uid..."
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-300/40"
                />
              </div>
            </label>

            <div className="mt-3 max-h-[32rem] overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-2">
              {loadingUsers ? <div className="px-3 py-4 text-sm text-slate-400">Loading warriors...</div> : null}

              {!loadingUsers && users.length === 0 ? (
                <div className="px-3 py-4 text-sm text-slate-400">No warriors found.</div>
              ) : null}

              {users.map((user) => {
                const assignedCount = user.uid
                  ? assets.filter((asset) => assetBelongsToUser(asset, user.uid as string)).length
                  : 0;

                return (
                  <button
                    key={user.key}
                    type="button"
                    onClick={() => void selectWarrior(user)}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                      user.uid && selectedUserUid === user.uid
                        ? "bg-sky-300/14 ring-1 ring-sky-200/35"
                        : materializingUserKey === user.key
                          ? "bg-amber-300/10 ring-1 ring-amber-200/30"
                          : "hover:bg-white/[0.045]"
                    }`}
                  >
                    <img
                      src={user.avatarPreviewUrl}
                      alt={`${user.displayName} avatar`}
                      className="h-10 w-10 flex-none rounded-xl border border-white/10 object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{user.displayName}</span>
                      <span className="block truncate text-[11px] text-slate-500">{userSubline(user)}</span>
                    </span>
                    {assignedCount > 0 ? (
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-100">
                        {assignedCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[1.65rem] border border-emerald-200/14 bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.10),transparent_42%),linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.26)]">
            <div className="text-xs uppercase tracking-[0.22em] text-emerald-100/70">
              Warrior Identity
            </div>

            {selectedUser ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/18 px-3 py-3">
                  <div className="text-xs text-slate-500">
                    Selected warrior
                  </div>

                  <div className="mt-1 text-lg font-semibold text-white">
                    {selectedUser.displayName}
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    Current country:{" "}
                    <span className="font-semibold text-slate-200">
                      {selectedUser.representedCountry || "Not set"}
                    </span>
                  </div>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-slate-200">
                    Represented country
                  </span>

                  <input
                    list="aoe2war-admin-country-options"
                    value={representedCountryDraft}
                    onChange={(event) =>
                      setRepresentedCountryDraft(
                        event.target.value
                      )
                    }
                    placeholder="Choose or type a country"
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300/40"
                  />

                  <datalist id="aoe2war-admin-country-options">
                    {COUNTRY_OPTIONS.map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>

                  <span className="text-[11px] leading-5 text-slate-500">
                    Admin-provisional. The player may later set their own represented country.
                    Clear the field to leave nationality unset.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void saveRepresentedCountry()
                  }
                  disabled={
                    savingIdentity ||
                    !selectedUser.uid
                  }
                  className="rounded-full bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingIdentity
                    ? "Saving..."
                    : "Save country"}
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/18 px-3 py-4 text-sm text-slate-500">
                Choose a warrior above to set their represented country.
              </div>
            )}
          </section>
        </aside>

        <section className="min-w-0 rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.06),transparent_44%),rgba(2,6,23,0.68)] p-4 shadow-[0_30px_110px_rgba(0,0,0,0.28)] sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Asset library</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">{CATEGORY_LABELS[category]}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {globalAssets.length} global asset{globalAssets.length === 1 ? "" : "s"} · {selectedAssets.length} selected
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleVisibleAssets}
                disabled={visibleAssets.length === 0}
                className="rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-200/30 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allVisibleSelected ? "Clear visible" : "Select visible"}
              </button>

              <button
                type="button"
                onClick={() => setSelectedAssetIds([])}
                disabled={selectedAssets.length === 0 || assigning}
                className="rounded-full border border-white/12 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/24 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>

              {category === "hero" ? (
                <Link
                  href="/admin/page-heroes"
                  className="rounded-full bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Use in Page Heroes
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void assignSelectedAssets()}
                  disabled={!selectedUserUid || selectedAssets.length === 0 || assigning}
                  className="rounded-full bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {assigning ? "Assigning..." : "Assign selected"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/18 px-3 py-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
                placeholder={`Search ${CATEGORY_LABELS[category].toLowerCase()}...`}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-300/40"
              />
            </div>

            <div className="text-xs text-slate-400">
              {category === "hero" ? (
                <span>Global Hero Image library · assign and order in Page Hero Studio</span>
              ) : (
                <>
                  Target:{" "}
                  <span className="font-semibold text-slate-200">
                    {selectedUser?.displayName || "choose warrior"}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="mt-5 grid min-w-0 gap-4 [grid-template-columns:repeat(auto-fill,minmax(13.75rem,1fr))] min-[1700px]:[grid-template-columns:repeat(auto-fill,minmax(15.5rem,1fr))]">
            {loadingAssets ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-300">
                Loading assets...
              </div>
            ) : null}

            {!loadingAssets && visibleAssets.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-300">
                No {CATEGORY_LABELS[category].toLowerCase()} found.
              </div>
            ) : null}

            {visibleAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                selected={selectedAssetIds.includes(asset.id)}
                busy={busyAssetId === asset.id}
                onToggleSelected={() => toggleAsset(asset.id)}
                onSetActive={(active) => void setAssetActive(asset, active)}
                onDelete={() => void deleteAsset(asset)}
              />
            ))}
          </div>
        </section>

        <aside className="min-w-0 rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.08),transparent_38%),rgba(2,6,23,0.70)] p-4 shadow-[0_30px_110px_rgba(0,0,0,0.28)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Assigned assets</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">{selectedUser?.displayName || "No warrior selected"}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {selectedUser ? `${totalAssignedForSelectedUser} total assigned` : "Choose a warrior to see their media pool."}
              </p>
            </div>

            {selectedUser ? (
              <div className="flex shrink-0 gap-2">
                <div className="text-center">
                  <img
                    src={
                      selectedUserProfileAsset?.url ||
                      selectedUser.avatarPreviewUrl
                    }
                    alt={`${selectedUser.displayName} Profile avatar`}
                    className="h-14 w-14 rounded-2xl border border-amber-200/24 object-cover object-top"
                  />

                  <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-100/65">
                    Profile
                  </div>
                </div>

                <div className="text-center">
                  {selectedUserFeaturedAsset ? (
                    <img
                      src={selectedUserFeaturedAsset.url}
                      alt={`${selectedUser.displayName} Featured Warrior`}
                      className="h-14 w-14 rounded-2xl border border-sky-200/24 object-cover object-top"
                    />
                  ) : (
                    <div className="grid h-14 w-14 place-items-center rounded-2xl border border-dashed border-white/12 bg-black/20 text-slate-600">
                      <Crown className="h-5 w-5" />
                    </div>
                  )}

                  <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-sky-100/65">
                    Featured
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3">
            {KIND_OPTIONS.map((kind) => {
              const rows =
                kind === "avatar"
                  ? selectedUserAvatarLibrary
                  : selectedUserAssignments.filter(
                      (asset) =>
                        asset.kind === kind
                    );

              return (
                <section key={kind} className="rounded-2xl border border-white/10 bg-black/18 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white">{CATEGORY_LABELS[kind]}</div>
                    <div className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400">
                      {rows.length}
                    </div>
                  </div>

                  {rows.length > 0 ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 min-[1800px]:grid-cols-3">
                      {rows.map((asset) => (
                        <AssignedAssetTile
                          key={asset.id}
                          asset={asset}
                          sourceLabel={
                            selectedUserUid &&
                            kind === "avatar"
                              ? avatarSourceLabel(
                                  asset,
                                  selectedUserUid
                                )
                              : "Assigned"
                          }

                          profileActive={
                            kind === "avatar" &&
                            selectedUserProfileAsset?.url ===
                              asset.url
                          }

                          featuredActive={
                            kind === "avatar" &&
                            selectedUserFeaturedAsset?.url ===
                              asset.url
                          }

                          canRemove={
                            kind !== "avatar" ||
                            Boolean(
                              selectedUserUid &&
                              asset.target ===
                                poolTargetFor(
                                  selectedUserUid
                                ) &&
                              selectedUserProfileAsset?.url !==
                                asset.url &&
                              selectedUserFeaturedAsset?.url !==
                                asset.url
                            )
                          }

                          busy={busyAssetId === asset.id}

                          onUse={() =>
                            void setAssetActive(
                              asset,
                              true
                            )
                          }

                          onFeature={() =>
                            void setFeaturedAvatar(asset)
                          }

                          onDelete={() =>
                            void deleteAsset(asset)
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-3 text-xs text-slate-500">
                      No {CATEGORY_LABELS[kind].toLowerCase()} assigned.
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {selectedUser && selectedUserAssignmentsForCategory.length === 0 && selectedAssets.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-sky-200/12 bg-sky-300/[0.045] px-3 py-3 text-xs text-slate-300">
              You have {selectedAssets.length} selected {CATEGORY_LABELS[category].toLowerCase()} ready to assign to {selectedUser.displayName}.
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function AssetCard({
  asset,
  selected,
  busy,
  onToggleSelected,
  onSetActive,
  onDelete,
}: {
  asset: ManagedMediaAsset;
  selected: boolean;
  busy: boolean;
  onToggleSelected: () => void;
  onSetActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`group min-w-0 overflow-hidden rounded-[1.35rem] border bg-white/[0.04] shadow-[0_20px_62px_rgba(0,0,0,0.22)] transition ${
        selected ? "border-sky-200/50 ring-1 ring-sky-200/30" : "border-white/8 hover:border-white/16"
      }`}
    >
      <button
        type="button"
        onClick={onToggleSelected}
        className="relative flex aspect-[1.22/1] w-full items-center justify-center bg-[linear-gradient(45deg,rgba(255,255,255,0.045)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.045)_75%),linear-gradient(45deg,rgba(255,255,255,0.045)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.045)_75%)] bg-[length:18px_18px] bg-[position:0_0,9px_9px]"
      >
        {asset.mimeType?.startsWith("video/") ? (
          <video src={asset.url} muted loop autoPlay playsInline className="h-full w-full object-contain p-3" />
        ) : (
          <img src={asset.url} alt={asset.alt || asset.label} className="h-full w-full object-contain p-3" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-black/18" />
        <span
          className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${
            asset.active
              ? "border-emerald-300/24 bg-emerald-400/12 text-emerald-100"
              : "border-white/10 bg-black/40 text-slate-400"
          }`}
        >
          {asset.active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {asset.active ? "Active" : "Inactive"}
        </span>
        <span
          className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-semibold ${
            selected
              ? "border-sky-200/40 bg-sky-300/20 text-sky-50"
              : "border-white/10 bg-black/40 text-slate-300"
          }`}
        >
          {selected ? "Selected" : "Select"}
        </span>
      </button>

      <div className="min-w-0 p-3">
        <div className="truncate text-sm font-semibold text-white">{asset.label}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{asset.originalName || asset.url}</div>
        <div className="mt-1 text-xs text-slate-500">{formatSize(asset.sizeBytes)}</div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onSetActive(!asset.active)}
            disabled={busy}
            className="rounded-full border border-amber-200/16 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {asset.active ? "Deactivate" : "Activate"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-red-300/18 px-2.5 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function AssignedAssetTile({
  asset,
  sourceLabel,
  profileActive,
  featuredActive,
  canRemove,
  busy,
  onUse,
  onFeature,
  onDelete,
}: {
  asset: ManagedMediaAsset;
  sourceLabel: string;
  profileActive: boolean;
  featuredActive: boolean;
  canRemove: boolean;
  busy: boolean;
  onUse: () => void;
  onFeature: () => void;
  onDelete: () => void;
}) {
  const isAvatar =
    asset.kind === "avatar";

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
      <div className="relative flex aspect-square items-center justify-center bg-black/20">
        {asset.mimeType?.startsWith("video/") ? (
          <video
            src={asset.url}
            muted
            loop
            autoPlay
            playsInline
            className="h-full w-full object-contain p-1.5"
          />
        ) : (
          <img
            src={asset.url}
            alt={
              asset.alt ||
              asset.label
            }
            className="h-full w-full object-contain p-1.5"
          />
        )}

        <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
          {profileActive ? (
            <span className="rounded-full border border-amber-100/25 bg-amber-300 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-950">
              Profile
            </span>
          ) : null}

          {featuredActive ? (
            <span className="rounded-full border border-sky-100/25 bg-sky-300 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-950">
              Featured
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-2">
        <div className="truncate text-xs font-semibold text-white">
          {asset.label}
        </div>

        <div className="mt-0.5 truncate text-[10px] text-slate-500">
          {sourceLabel}
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {isAvatar ? (
            featuredActive ? (
              <span className="rounded-full border border-sky-200/18 bg-sky-300/10 px-2 py-1 text-[10px] font-semibold text-sky-100">
                Featured
              </span>
            ) : (
              <button
                type="button"
                onClick={onFeature}
                disabled={busy}
                className="rounded-full border border-sky-200/18 px-2 py-1 text-[10px] font-semibold text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Feature
              </button>
            )
          ) : !asset.active ? (
            <button
              type="button"
              onClick={onUse}
              disabled={busy}
              className="rounded-full border border-sky-200/18 px-2 py-1 text-[10px] font-semibold text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Use
            </button>
          ) : null}

          <button
            type="button"
            onClick={onDelete}
            disabled={
              busy ||
              !canRemove
            }
            title={
              canRemove
                ? "Remove"
                : "Profile, personal, and Featured avatars are protected."
            }
            className="rounded-full border border-red-300/18 px-2 py-1 text-[10px] font-semibold text-red-100 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
