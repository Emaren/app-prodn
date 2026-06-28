"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Globe2,
  ImagePlus,
  RefreshCw,
  Shield,
  Trash2,
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

const KIND_OPTIONS = ["avatar", "belt", "artifact", "logo", "background", "other"] as const;

const TARGET_HINTS: Record<string, string[]> = {
  avatar: ["sniper", "jim", "julio-alvarez", "emaren", "silhouette"],
  belt: ["world", "chaos", "womens", "tag-team", "national-usa", "national-mexico", "national-uk", "national-canada"],
  artifact: ["designation-giant-killer", "designation-comeback-king", "designation-siege-lord", "designation-silent-killer"],
  logo: ["footer-wolo"],
  background: ["lobby-extreme", "champions-hero"],
  other: ["promo"],
};

const COUNTRY_OPTIONS = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "American Samoa",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Aruba",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bermuda",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "British Virgin Islands",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Cayman Islands",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Cote d'Ivoire",
  "Croatia",
  "Cuba",
  "Curacao",
  "Cyprus",
  "Czech Republic",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "England",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Faroe Islands",
  "Fiji",
  "Finland",
  "France",
  "French Polynesia",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Greenland",
  "Grenada",
  "Guam",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hong Kong",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kosovo",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Macau",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Caledonia",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Northern Ireland",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Puerto Rico",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Scotland",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Sint Maarten",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "US Virgin Islands",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Wales",
  "Yemen",
  "Zambia",
  "Zimbabwe",
] as const;

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AssetStatusFilter = "active" | "inactive" | "all";

type AssetGroup = {
  groupKey: string;
  targetKey: string;
  targetLabel: string;
  assets: ManagedMediaAsset[];
  active: ManagedMediaAsset[];
  inactive: ManagedMediaAsset[];
  latest: ManagedMediaAsset;
};

function normalizeAssetSearch(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function assetTargetKey(asset: Pick<ManagedMediaAsset, "target">) {
  return asset.target || "__untargeted__";
}

function assetTargetLabel(target: string | null | undefined) {
  return target || "untargeted";
}

function assetSearchBlob(asset: ManagedMediaAsset) {
  return [asset.label, asset.kind, asset.target, asset.alt, asset.originalName, asset.url, String(asset.id)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildAssetGroups(rows: ManagedMediaAsset[]) {
  const groups = new Map<string, AssetGroup>();

  for (const asset of rows) {
    const targetKey = assetTargetKey(asset);
    const groupKey = `${asset.kind}:${targetKey}`;
    const existing = groups.get(groupKey);

    if (existing) {
      existing.assets.push(asset);
      if (asset.active) existing.active.push(asset);
      else existing.inactive.push(asset);

      if (new Date(asset.updatedAt).getTime() > new Date(existing.latest.updatedAt).getTime()) {
        existing.latest = asset;
      }

      continue;
    }

    groups.set(groupKey, {
      groupKey,
      targetKey,
      targetLabel: assetTargetLabel(asset.target),
      assets: [asset],
      active: asset.active ? [asset] : [],
      inactive: asset.active ? [] : [asset],
      latest: asset,
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    const duplicateDelta = right.assets.length - left.assets.length;
    if (duplicateDelta !== 0) return duplicateDelta;
    return left.targetLabel.localeCompare(right.targetLabel);
  });
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

  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<AdminMediaUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUserUid, setSelectedUserUid] = useState("");
  const [materializingUserKey, setMaterializingUserKey] = useState<string | null>(null);

  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileCountry, setProfileCountry] = useState("");
  const [profileGenderDivision, setProfileGenderDivision] = useState("Man");
  const [profileSaving, setProfileSaving] = useState(false);

  const [directAvatarFile, setDirectAvatarFile] = useState<File | null>(null);
  const [directAvatarUploading, setDirectAvatarUploading] = useState(false);

  const [assetSearch, setAssetSearch] = useState("");
  const [assetStatusFilter, setAssetStatusFilter] = useState<AssetStatusFilter>("active");
  const [assetTargetFilter, setAssetTargetFilter] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const hints = TARGET_HINTS[kind] ?? [];
  const selectedAssets = useMemo(() => assets.filter((asset) => asset.kind === kind), [assets, kind]);
  const activeAssets = useMemo(() => selectedAssets.filter((asset) => asset.active), [selectedAssets]);
  const assetGroups = useMemo(() => buildAssetGroups(selectedAssets), [selectedAssets]);
  const duplicateGroups = useMemo(
    () => assetGroups.filter((group) => group.assets.length > 1 || group.inactive.length > 0),
    [assetGroups]
  );
  const targetOptions = useMemo(() => assetGroups.map((group) => group.targetKey), [assetGroups]);
  const filteredAssets = useMemo(() => {
    const search = normalizeAssetSearch(assetSearch);

    return selectedAssets.filter((asset) => {
      if (assetStatusFilter === "active" && !asset.active) return false;
      if (assetStatusFilter === "inactive" && asset.active) return false;
      if (assetTargetFilter && assetTargetKey(asset) !== assetTargetFilter) return false;
      if (search && !assetSearchBlob(asset).includes(search)) return false;
      return true;
    });
  }, [assetSearch, assetStatusFilter, assetTargetFilter, selectedAssets]);
  const selectedAssetRows = useMemo(
    () => assets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [assets, selectedAssetIds]
  );
  const selectedInactiveAssetCount = selectedAssetRows.filter((asset) => !asset.active).length;
  const selectedUser = useMemo(
    () => users.find((user) => user.uid === selectedUserUid) || null,
    [users, selectedUserUid]
  );

  const countryOptions = useMemo(() => {
    const current = profileCountry.trim();
    const base = [...COUNTRY_OPTIONS];

    if (current && !base.includes(current as (typeof COUNTRY_OPTIONS)[number])) {
      return [current, ...base];
    }

    return base;
  }, [profileCountry]);

  async function loadAssets() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/media-assets", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as {
        assets?: ManagedMediaAsset[];
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not load media assets.");
      }

      const nextAssets = Array.isArray(payload.assets) ? payload.assets : [];
      setAssets(nextAssets);
      setSelectedAssetIds((current) => current.filter((id) => nextAssets.some((asset) => asset.id === id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load media assets.");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers(query = userQuery) {
    setUsersLoading(true);

    try {
      const params = new URLSearchParams();

      if (query.trim()) {
        params.set("q", query.trim());
      }

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
      setUsersLoading(false);
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

  useEffect(() => {
    void loadAssets();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers(userQuery);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [userQuery]);

  useEffect(() => {
    if (!selectedUser) {
      setProfileDisplayName("");
      setProfileCountry("");
      setProfileGenderDivision("Man");
      return;
    }

    setProfileDisplayName(selectedUser.displayName || "");
    setProfileCountry(selectedUser.representedCountry || "");
    setProfileGenderDivision(selectedUser.genderDivision || "Man");
  }, [selectedUser]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    setFile(nextFile);

    if (nextFile && !label.trim()) {
      setLabel(nextFile.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    }
  }

  function chooseDirectAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    setDirectAvatarFile(event.target.files?.[0] ?? null);
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

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Upload failed.");
      }

      setFile(null);
      setLabel("");
      setAlt("");
      setNotice("Global asset uploaded.");
      await loadAssets();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSelectedUserProfile() {
    if (!selectedUserUid) {
      setError("Choose a warrior first.");
      return;
    }

    setProfileSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/media-assets/user-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uid: selectedUserUid,
          displayName: profileDisplayName,
          representedCountry: profileCountry,
          genderDivision: profileGenderDivision,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not save warrior identity.");
      }

      setNotice("Warrior identity saved.");
      await loadUsers();
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Could not save warrior identity.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadAvatarDirectlyToUser() {
    if (!selectedUserUid) {
      setError("Choose a warrior first.");
      return;
    }

    if (!directAvatarFile) {
      setError("Choose an avatar image first.");
      return;
    }

    const displayName = profileDisplayName || selectedUser?.displayName || selectedUserUid;

    setDirectAvatarUploading(true);
    setError(null);
    setNotice(null);

    try {
      const body = new FormData();
      body.set("kind", "avatar");
      body.set("target", "user-" + selectedUserUid);
      body.set("label", displayName + " avatar");
      body.set("alt", displayName + " avatar");
      body.set("file", directAvatarFile);

      const response = await fetch("/api/admin/media-assets", {
        method: "POST",
        body,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Upload failed.");
      }

      setDirectAvatarFile(null);
      setAssetStatusFilter("active");
      setAssetTargetFilter("user-" + selectedUserUid);
      setAssetSearch("");
      setNotice("Avatar uploaded for " + displayName + ". Previous avatars for this warrior were deactivated, not deleted.");
      await Promise.all([loadAssets(), loadUsers()]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setDirectAvatarUploading(false);
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
    }
  }

  async function deleteAsset(asset: ManagedMediaAsset) {
    const confirmed = window.confirm(`Delete "${asset.label}"?`);

    if (!confirmed) {
      return;
    }

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

      setNotice(
        payload.keptFileBecauseStillReferenced
          ? `${asset.label} deleted. File kept because another row still references it.`
          : `${asset.label} deleted${payload.removedFile ? " and file removed" : ""}.`
      );

      await loadAssets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Delete failed.");
    }
  }


  function toggleAssetSelection(assetId: number) {
    setSelectedAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]
    );
  }

  function selectFilteredAssets() {
    setSelectedAssetIds(filteredAssets.map((asset) => asset.id));
  }

  function focusAssetGroup(group: AssetGroup) {
    setAssetTargetFilter(group.targetKey);
    setAssetStatusFilter("all");
    setAssetSearch("");
  }

  async function deleteAssetsBatch(rows: ManagedMediaAsset[], message: string) {
    if (rows.length === 0) return;

    const confirmed = window.confirm(message);
    if (!confirmed) return;

    setBulkDeleting(true);
    setError(null);
    setNotice(null);

    let deleted = 0;

    try {
      for (const asset of rows) {
        const response = await fetch(`/api/admin/media-assets/${asset.id}`, {
          method: "DELETE",
        });

        if (response.ok) {
          deleted += 1;
          continue;
        }

        const payload = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new Error(payload.detail || `Delete failed for ${asset.label}.`);
      }

      setSelectedAssetIds([]);
      setNotice(`Deleted ${deleted} media asset${deleted === 1 ? "" : "s"}.`);
      await loadAssets();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Bulk delete failed.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function deleteSelectedAssets() {
    await deleteAssetsBatch(
      selectedAssetRows,
      `Delete ${selectedAssetRows.length} selected media asset${selectedAssetRows.length === 1 ? "" : "s"}?`
    );
  }

  async function deleteInactiveForGroup(group: AssetGroup) {
    await deleteAssetsBatch(
      group.inactive,
      `Delete ${group.inactive.length} inactive upload${group.inactive.length === 1 ? "" : "s"} for ${group.targetLabel}? The active row will be kept.`
    );
  }

  return (
    <main className="mx-auto max-w-[96rem] space-y-6 px-4 py-8 text-white sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
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

      {(notice || error) && (
        <section
          className={`rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-300/18 bg-red-400/10 text-red-100"
              : "border-emerald-300/18 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {error || notice}
        </section>
      )}

      <section className="grid min-w-0 gap-6 xl:grid-cols-[24rem_minmax(0,1fr)] xl:items-start">
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">
          <section className="overflow-hidden rounded-[1.35rem] border border-sky-200/14 bg-[linear-gradient(135deg,rgba(56,189,248,0.10),rgba(255,255,255,0.025))] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-sky-100/75">
              <UserRound className="h-4 w-4" />
              Warrior Identity
            </div>

            <div className="mt-4 grid min-w-0 gap-3">
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-semibold text-slate-200">Search warriors</span>
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="name, email, uid, wallet..."
                  className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-300/40"
                />
              </label>

              <div className="max-h-64 min-w-0 overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-black/22 p-2">
                {usersLoading ? (
                  <div className="px-3 py-4 text-sm text-slate-400">Loading warriors...</div>
                ) : null}

                {!usersLoading && users.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-400">No matching warriors found. Search by leaderboard name, Steam name, uid, wallet, or nationality.</div>
                ) : null}

                {users.map((user) => (
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
                      className="h-9 w-9 flex-none rounded-xl border border-white/10 object-cover"
                    />

                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="block truncate text-sm font-semibold text-white">{user.displayName}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {user.uid || "tracked player"}
                        {typeof user.totalMatches === "number" ? ` · ${user.totalMatches} match${user.totalMatches === 1 ? "" : "es"}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {selectedUser ? (
                <div className="grid min-w-0 gap-3 rounded-2xl border border-white/10 bg-black/18 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <img
                      src={selectedUser.avatarPreviewUrl}
                      alt={`${selectedUser.displayName} avatar`}
                      className="h-14 w-14 flex-none rounded-2xl border border-sky-200/18 object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{selectedUser.displayName}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {selectedUser.representedCountry || "No country / region"} · {selectedUser.genderDivision || "Man"}
                      </div>
                    </div>
                  </div>

                  <label className="grid min-w-0 gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Display name
                    </span>
                    <input
                      value={profileDisplayName}
                      onChange={(event) => setProfileDisplayName(event.target.value)}
                      className="min-w-0 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-sky-300/40"
                    />
                  </label>

                  <label className="grid min-w-0 gap-1.5">
                    <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <Globe2 className="h-3.5 w-3.5" />
                      Nationality
                    </span>
                                        <select
                      value={profileCountry}
                      onChange={(event) => setProfileCountry(event.target.value)}
                      className="min-w-0 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-sky-300/40"
                    >
                      <option value="">No country / region</option>
                      {countryOptions.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid min-w-0 gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Gender division
                    </span>
                    <select
                      value={profileGenderDivision}
                      onChange={(event) => setProfileGenderDivision(event.target.value)}
                      className="min-w-0 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:border-sky-300/40"
                    >
                      <option value="Man">Man</option>
                      <option value="Woman">Woman</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => void saveSelectedUserProfile()}
                    disabled={profileSaving}
                    className="w-full rounded-full border border-sky-200/20 px-4 py-2.5 text-sm font-semibold text-sky-100 transition hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {profileSaving ? "Saving..." : "Save identity"}
                  </button>

                  <label className="grid min-w-0 gap-2 rounded-2xl border border-dashed border-sky-200/18 bg-black/22 px-3 py-3">
                    <span className="text-sm font-semibold text-slate-200">Avatar</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseDirectAvatarFile} />
                    <span className="truncate text-xs text-slate-500">
                      {directAvatarFile
                        ? `${directAvatarFile.name} · ${formatSize(directAvatarFile.size)}`
                        : "Upload directly to this warrior."}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => void uploadAvatarDirectlyToUser()}
                    disabled={directAvatarUploading || !directAvatarFile}
                    className="w-full rounded-full bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {directAvatarUploading ? "Uploading..." : "Upload avatar"}
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-4 text-sm text-slate-400">
                  Select a warrior to edit nationality, gender division, and avatar.
                </div>
              )}
            </div>
          </section>

          <form
            onSubmit={submitUpload}
            className="overflow-hidden rounded-[1.35rem] border border-amber-200/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)]"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-amber-100/70">
              <ImagePlus className="h-4 w-4" />
              Global Media
            </div>

            <div className="mt-4 grid min-w-0 gap-3">
              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-semibold text-slate-200">Kind</span>
                <select
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as (typeof KIND_OPTIONS)[number]);
                    setTarget("");
                  }}
                  className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-semibold text-slate-200">Target</span>
                <input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="sniper, world, footer-wolo..."
                  className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-300/40"
                />
              </label>

              <div className="flex min-w-0 flex-wrap gap-1.5 rounded-2xl border border-white/6 bg-black/10 p-2">
                {hints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => setTarget(hint)}
                    title={hint}
                    className="max-w-full truncate rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-amber-200/30 hover:text-amber-100"
                  >
                    {hint}
                  </button>
                ))}
              </div>

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-semibold text-slate-200">Label</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </label>

              <label className="grid min-w-0 gap-2">
                <span className="text-sm font-semibold text-slate-200">Alt text</span>
                <input
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300/40"
                />
              </label>

              <label className="grid min-w-0 gap-2 rounded-2xl border border-dashed border-amber-200/18 bg-black/20 px-3 py-4">
                <span className="text-sm font-semibold text-slate-200">Image file</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={chooseFile} />
                <span className="truncate text-xs text-slate-500">
                  {file ? `${file.name} · ${formatSize(file.size)}` : "For belts, logos, backgrounds, and global art."}
                </span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Uploading..." : "Upload global asset"}
              </button>
            </div>
          </form>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-sky-100/60">
              <Shield className="h-4 w-4" />
              <span>Active {kind} assets</span>
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

          <div className="mt-5 grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
            {(loading ? [] : activeAssets).map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onSetActive={(nextActive) => void setAssetActive(asset, nextActive)}
                onDelete={() => void deleteAsset(asset)}
              />
            ))}

            {!loading && activeAssets.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-300">
                No active {kind} assets yet.
              </div>
            ) : null}
          </div>
        </section>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-slate-950/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Media library</div>
            <div className="mt-1 text-sm text-slate-400">
              {selectedAssets.length} {kind} row{selectedAssets.length === 1 ? "" : "s"} · {activeAssets.length} active · {selectedAssets.length - activeAssets.length} inactive
            </div>
          </div>

          {selectedAssetIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-2 py-1">
              <span className="px-2 text-xs text-slate-300">
                {selectedAssetIds.length} selected{selectedInactiveAssetCount > 0 ? ` · ${selectedInactiveAssetCount} inactive` : ""}
              </span>
              <button
                type="button"
                onClick={() => setSelectedAssetIds([])}
                className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void deleteSelectedAssets()}
                disabled={bulkDeleting}
                className="rounded-full border border-red-300/20 px-2.5 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-400/10 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_14rem_auto]">
          <input
            value={assetSearch}
            onChange={(event) => setAssetSearch(event.target.value)}
            placeholder="Search label, target, filename, url..."
            className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-300/40"
          />

          <select
            value={assetStatusFilter}
            onChange={(event) => setAssetStatusFilter(event.target.value as AssetStatusFilter)}
            className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-300/40"
          >
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
            <option value="all">All rows</option>
          </select>

          <select
            value={assetTargetFilter}
            onChange={(event) => setAssetTargetFilter(event.target.value)}
            className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white outline-none focus:border-sky-300/40"
          >
            <option value="">All targets</option>
            {targetOptions.map((option) => (
              <option key={option} value={option}>
                {option === "__untargeted__" ? "untargeted" : option}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={selectFilteredAssets}
            disabled={filteredAssets.length === 0}
            className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-sky-200/30 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Select visible
          </button>
        </div>

        {duplicateGroups.length > 0 ? (
          <div className="mt-4 grid min-w-0 gap-2 rounded-2xl border border-amber-200/12 bg-amber-300/[0.035] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/65">
              Target stacks
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              {duplicateGroups.slice(0, 16).map((group) => (
                <div
                  key={group.groupKey}
                  className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/20 px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => focusAssetGroup(group)}
                    className="max-w-[13rem] truncate px-1 text-xs font-semibold text-amber-50 transition hover:text-white"
                    title={group.targetLabel}
                  >
                    {group.targetLabel} · {group.assets.length}
                  </button>
                  {group.inactive.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void deleteInactiveForGroup(group)}
                      disabled={bulkDeleting}
                      className="rounded-full border border-red-300/14 px-2 py-0.5 text-[10px] font-semibold text-red-100 transition hover:bg-red-400/10 disabled:opacity-50"
                    >
                      prune {group.inactive.length}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fill,minmax(13rem,1fr))]">
          {filteredAssets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              selected={selectedAssetIds.includes(asset.id)}
              onToggleSelect={() => toggleAssetSelection(asset.id)}
              onSetActive={(nextActive) => void setAssetActive(asset, nextActive)}
              onDelete={() => void deleteAsset(asset)}
            />
          ))}

          {!loading && filteredAssets.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-5 text-sm text-slate-300">
              No {assetStatusFilter === "active" ? "active" : assetStatusFilter === "inactive" ? "inactive" : "matching"} {kind} uploads.
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function AssetCard({
  asset,
  selected = false,
  onToggleSelect,
  onSetActive,
  onDelete,
}: {
  asset: ManagedMediaAsset;
  selected?: boolean;
  onToggleSelect?: () => void;
  onSetActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`min-w-0 overflow-hidden rounded-2xl border bg-white/[0.03] shadow-[0_18px_54px_rgba(0,0,0,0.18)] transition ${
        selected ? "border-sky-200/42 ring-1 ring-sky-200/30" : "border-white/8"
      }`}
    >
      <div className="relative flex aspect-[1.45/1] items-center justify-center bg-[linear-gradient(45deg,rgba(255,255,255,0.045)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.045)_75%),linear-gradient(45deg,rgba(255,255,255,0.045)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.045)_75%)] bg-[length:18px_18px] bg-[position:0_0,9px_9px]">
        <img src={asset.url} alt={asset.alt || asset.label} className="h-full w-full object-contain p-2.5" />
        <div className="pointer-events-none absolute inset-0 bg-black/25" />
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

      <div className="min-w-0 p-2.5">
        <div className="truncate text-sm font-semibold text-white">{asset.label}</div>
        <div className="mt-1 truncate text-xs text-slate-500">
          {asset.kind}
          {asset.target ? ` / ${asset.target}` : ""} · {formatSize(asset.sizeBytes)}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {onToggleSelect ? (
            <button
              type="button"
              onClick={onToggleSelect}
              className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                selected
                  ? "border-sky-200/30 bg-sky-300/12 text-sky-100"
                  : "border-white/10 text-slate-300 hover:border-sky-200/24 hover:text-sky-100"
              }`}
            >
              {selected ? "Selected" : "Select"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onSetActive(!asset.active)}
            className="rounded-full border border-amber-200/16 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10"
          >
            {asset.active ? "Deactivate" : "Activate"}
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded-full border border-red-300/18 px-2.5 py-1.5 text-xs font-semibold text-red-100 transition hover:bg-red-400/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>

          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-white/24 hover:text-white"
          >
            Open
          </a>
        </div>
      </div>
    </article>
  );
}
