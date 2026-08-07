"use client";

import Link from "next/link";
import {
  Check,
  Crown,
  ImagePlus,
  Landmark,
  RefreshCw,
  Shield,
  UploadCloud,
  UserRoundCog,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type MediaAsset = {
  id: number;
  label: string;
  url: string;
  alt: string | null;
  target: string | null;
  active: boolean;
  current?: boolean;
};

type ClanRow = {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  crestUrl: string | null;
  status: string;
  memberCount: number;
  managers: Array<{
    uid: string;
    displayName: string;
    role: string;
  }>;
  crestOptions: MediaAsset[];
};

type PaidRequest = {
  publicId: string;
  requesterUid: string;
  requesterName: string;
  clanName: string;
  desiredSlug: string;
  foundingMessage: string;
  amountWolo: number;
  txHash: string | null;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
};

type ClanPayload = {
  clans: ClanRow[];
  crestLibrary: MediaAsset[];
  paidRequests: PaidRequest[];
};

export default function AdminClansPage() {
  const [payload, setPayload] =
    useState<ClanPayload>({
      clans: [],
      crestLibrary: [],
      paidRequests: [],
    });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadLabel, setUploadLabel] =
    useState("");
  const [newClanName, setNewClanName] =
    useState("");
  const [newClanTagline, setNewClanTagline] =
    useState("");
  const [newClanDescription, setNewClanDescription] =
    useState("");
  const [crestChoice, setCrestChoice] =
    useState<Record<number, string>>({});
  const [managerUid, setManagerUid] =
    useState<Record<number, string>>({});
  const [managerRole, setManagerRole] =
    useState<Record<number, string>>({});

  const pendingRequests = useMemo(
    () =>
      payload.paidRequests.filter(
        (request) =>
          request.status !== "accepted",
      ),
    [payload.paidRequests],
  );

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/admin/clans",
        {
          cache: "no-store",
        },
      );
      const next = (await response
        .json()
        .catch(() => ({}))) as ClanPayload & {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          next.detail ||
            "Could not load Clan Command.",
        );
      }

      setPayload({
        clans: Array.isArray(next.clans)
          ? next.clans
          : [],
        crestLibrary: Array.isArray(
          next.crestLibrary,
        )
          ? next.crestLibrary
          : [],
        paidRequests: Array.isArray(
          next.paidRequests,
        )
          ? next.paidRequests
          : [],
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load Clan Command.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function chooseFiles(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selected = Array.from(
      event.target.files || [],
    );
    setFiles(selected);

    if (
      selected.length === 1 &&
      !uploadLabel.trim()
    ) {
      setUploadLabel(
        selected[0].name
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]+/g, " "),
      );
    }
  }

  async function uploadCrests(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (files.length === 0) {
      setError("Choose one or more crest images.");
      return;
    }

    setBusy("upload");
    setError(null);
    setNotice(null);

    try {
      for (const file of files) {
        const form = new FormData();
        const fallbackLabel = file.name
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]+/g, " ");

        form.set("kind", "crest");
        form.set("target", "");
        form.set(
          "label",
          files.length === 1
            ? uploadLabel || fallbackLabel
            : fallbackLabel,
        );
        form.set(
          "alt",
          files.length === 1
            ? uploadLabel || fallbackLabel
            : fallbackLabel,
        );
        form.set("file", file);

        const response = await fetch(
          "/api/admin/media-assets",
          {
            method: "POST",
            body: form,
          },
        );
        const result = (await response
          .json()
          .catch(() => ({}))) as {
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.detail ||
              `Upload failed for ${file.name}.`,
          );
        }
      }

      const uploadedCount = files.length;
      setFiles([]);
      setUploadLabel("");
      setNotice(
        `${uploadedCount} clan crest${uploadedCount === 1 ? "" : "s"} uploaded to the Armory.`,
      );
      await load();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Crest upload failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createClan(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (newClanName.trim().length < 2) {
      setError("Name the clan first.");
      return;
    }

    setBusy("create");
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/clans",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create_clan",
            name: newClanName,
            tagline: newClanTagline,
            description: newClanDescription,
          }),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.detail ||
            "Could not create clan.",
        );
      }

      setNewClanName("");
      setNewClanTagline("");
      setNewClanDescription("");
      setNotice("Clan hall foundation saved.");
      await load();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create clan.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function acceptRequest(
    request: PaidRequest,
  ) {
    setBusy(`request:${request.publicId}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/clans",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "accept_request",
            publicId: request.publicId,
          }),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.detail ||
            "Could not accept Clan Alert.",
        );
      }

      setNotice(
        `${request.clanName} has been founded. ${request.requesterName} now holds the owner seat.`,
      );
      await load();
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Could not accept Clan Alert.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function assignCrest(clan: ClanRow) {
    const assetId = Number(
      crestChoice[clan.id],
    );

    if (!Number.isInteger(assetId)) {
      setError(
        `Choose a crest for ${clan.name}.`,
      );
      return;
    }

    setBusy(`assign:${clan.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/clans/crests",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clanId: clan.id,
            assetIds: [assetId],
          }),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.detail ||
            "Could not assign crest.",
        );
      }

      setNotice(
        `Crest assigned to ${clan.name}.`,
      );
      await load();
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Could not assign crest.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function selectCurrentCrest(
    clan: ClanRow,
    asset: MediaAsset,
  ) {
    setBusy(`current:${clan.id}:${asset.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/clans/crests",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clanId: clan.id,
            assetId: asset.id,
          }),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.detail ||
            "Could not raise crest.",
        );
      }

      setNotice(
        `${asset.label} raised over ${clan.name}.`,
      );
      await load();
    } catch (selectError) {
      setError(
        selectError instanceof Error
          ? selectError.message
          : "Could not raise crest.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function setManager(clan: ClanRow) {
    const uid =
      managerUid[clan.id]?.trim() || "";
    const role =
      managerRole[clan.id] || "admin";

    if (!uid) {
      setError(
        `Enter a user UID for ${clan.name}.`,
      );
      return;
    }

    setBusy(`manager:${clan.id}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(
        "/api/admin/clans",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "set_manager",
            clanId: clan.id,
            uid,
            role,
          }),
        },
      );
      const result = (await response
        .json()
        .catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.detail ||
            "Could not assign clan role.",
        );
      }

      setManagerUid((current) => ({
        ...current,
        [clan.id]: "",
      }));
      setNotice(
        `${uid} is now ${role} of ${clan.name}.`,
      );
      await load();
    } catch (managerError) {
      setError(
        managerError instanceof Error
          ? managerError.message
          : "Could not assign clan role.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen w-full max-w-none space-y-6 text-white">
      <header className="overflow-hidden rounded-[2rem] border border-red-200/14 bg-[radial-gradient(circle_at_12%_0%,rgba(153,27,27,0.18),transparent_32%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.10),transparent_28%),linear-gradient(145deg,rgba(22,13,10,0.98),rgba(4,6,9,0.98))] px-6 py-6 shadow-[0_32px_110px_rgba(0,0,0,0.38)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.34em] text-red-100/65">
              Admin · Clan Command
            </div>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl">
              Raise halls. Assign banners.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-400">
              Upload crest art, grant it to a clan, choose the active
              banner, appoint clan administrators, and accept verified
              100 WOLO Clan Alerts.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-stone-300 transition hover:border-amber-200/30 hover:text-amber-100"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              href="/admin"
              className="rounded-full border border-white/12 px-4 py-2 text-sm text-stone-300 transition hover:border-amber-200/30 hover:text-amber-100"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      {(notice || error) ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300/18 bg-rose-400/[0.07] text-rose-200"
              : "border-emerald-300/18 bg-emerald-400/[0.07] text-emerald-100"
          }`}
        >
          {error || notice}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={uploadCrests}
          className="rounded-[1.8rem] border border-amber-200/12 bg-black/30 p-5"
        >
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/65">
            <UploadCloud className="h-4 w-4" />
            Crest Armory
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            Upload clan crests
          </h2>
          <input
            value={uploadLabel}
            onChange={(event) =>
              setUploadLabel(event.target.value)
            }
            placeholder="Optional crest label"
            className="mt-4 w-full rounded-xl border border-white/10 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-amber-200/30"
          />
          <label className="mt-3 grid cursor-pointer gap-2 rounded-xl border border-dashed border-amber-200/20 bg-amber-300/[0.035] p-4">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ImagePlus className="h-4 w-4" />
              PNG, JPG, WEBP, or GIF
            </span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={chooseFiles}
            />
          </label>
          <button
            type="submit"
            disabled={
              busy === "upload" ||
              files.length === 0
            }
            className="mt-4 rounded-full bg-amber-300 px-5 py-3 text-sm font-black text-stone-950 disabled:opacity-45"
          >
            {busy === "upload"
              ? "Uploading…"
              : `Upload ${files.length || ""} crest${files.length === 1 ? "" : "s"}`}
          </button>
        </form>

        <form
          onSubmit={createClan}
          className="rounded-[1.8rem] border border-red-200/12 bg-black/30 p-5"
        >
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-red-100/65">
            <Landmark className="h-4 w-4" />
            Found manually
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            Create a clan hall
          </h2>
          <div className="mt-4 grid gap-3">
            <input
              value={newClanName}
              onChange={(event) =>
                setNewClanName(
                  event.target.value,
                )
              }
              placeholder="Clan name"
              className="rounded-xl border border-white/10 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-red-200/30"
            />
            <input
              value={newClanTagline}
              onChange={(event) =>
                setNewClanTagline(
                  event.target.value,
                )
              }
              placeholder="Tagline"
              className="rounded-xl border border-white/10 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-red-200/30"
            />
            <textarea
              value={newClanDescription}
              onChange={(event) =>
                setNewClanDescription(
                  event.target.value,
                )
              }
              rows={3}
              placeholder="Hall description"
              className="rounded-xl border border-white/10 bg-stone-950 px-4 py-3 text-sm outline-none focus:border-red-200/30"
            />
          </div>
          <button
            type="submit"
            disabled={busy === "create"}
            className="mt-4 rounded-full bg-red-700 px-5 py-3 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-45"
          >
            {busy === "create"
              ? "Founding…"
              : "Found clan"}
          </button>
        </form>
      </section>

      <section className="rounded-[1.8rem] border border-amber-200/12 bg-black/28 p-5">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/65">
          <Shield className="h-4 w-4" />
          Verified Clan Alerts
        </div>
        <h2 className="mt-2 text-2xl font-semibold">
          Paid halls awaiting your word
        </h2>

        {pendingRequests.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-5 text-sm text-stone-500">
            No verified 100 WOLO Clan Alerts are waiting.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {pendingRequests.map((request) => (
              <div
                key={request.publicId}
                className="rounded-[1.25rem] border border-white/9 bg-white/[0.025] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-serif text-xl">
                      {request.clanName}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {request.requesterName} · /clans/
                      {request.desiredSlug}
                    </div>
                  </div>
                  <div className="rounded-full border border-emerald-200/16 bg-emerald-300/[0.06] px-3 py-1 text-xs text-emerald-100">
                    {request.amountWolo} WOLO verified
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-300">
                  {request.foundingMessage}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <code className="text-[10px] text-stone-600">
                    {request.txHash ||
                      "verified transaction"}
                  </code>
                  <button
                    type="button"
                    onClick={() =>
                      void acceptRequest(request)
                    }
                    disabled={
                      busy ===
                      `request:${request.publicId}`
                    }
                    className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-xs font-black text-stone-950 disabled:opacity-45"
                  >
                    <Check className="h-4 w-4" />
                    Accept payment &amp; found hall
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-5">
        {loading ? (
          <div className="h-64 animate-pulse rounded-[2rem] border border-white/8 bg-white/[0.025]" />
        ) : (
          payload.clans.map((clan) => (
            <article
              key={clan.id}
              className="overflow-hidden rounded-[2rem] border border-red-200/12 bg-[linear-gradient(145deg,rgba(20,12,10,0.94),rgba(4,6,9,0.98))] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.32)]"
            >
              <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
                <div>
                  <div className="aspect-square overflow-hidden rounded-[1.4rem] border border-amber-100/14 bg-black/45">
                    {clan.crestUrl ? (
                      <img
                        src={clan.crestUrl}
                        alt={`${clan.name} crest`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-stone-700">
                        <Shield className="h-20 w-20" />
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/clans/${clan.slug}`}
                    className="mt-3 block text-center text-xs font-semibold text-amber-100/70 hover:text-amber-100"
                  >
                    Open hall
                  </Link>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-3xl">
                        {clan.name}
                      </h2>
                      <div className="mt-1 text-xs text-stone-500">
                        /clans/{clan.slug} ·{" "}
                        {clan.memberCount} members
                      </div>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-stone-400">
                      {clan.status}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <section className="rounded-[1.25rem] border border-white/8 bg-black/22 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/55">
                        Assign crest art
                      </div>
                      <div className="mt-3 flex gap-2">
                        <select
                          value={
                            crestChoice[clan.id] || ""
                          }
                          onChange={(event) =>
                            setCrestChoice(
                              (current) => ({
                                ...current,
                                [clan.id]:
                                  event.target
                                    .value,
                              }),
                            )
                          }
                          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-stone-950 px-3 py-2 text-sm"
                        >
                          <option value="">
                            Choose from Armory
                          </option>
                          {payload.crestLibrary.map(
                            (asset) => (
                              <option
                                key={asset.id}
                                value={asset.id}
                              >
                                {asset.label}
                              </option>
                            ),
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            void assignCrest(clan)
                          }
                          disabled={
                            busy ===
                            `assign:${clan.id}`
                          }
                          className="rounded-xl bg-amber-300 px-4 text-xs font-black text-stone-950 disabled:opacity-45"
                        >
                          Assign
                        </button>
                      </div>
                    </section>

                    <section className="rounded-[1.25rem] border border-white/8 bg-black/22 p-4">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-red-100/55">
                        <UserRoundCog className="h-4 w-4" />
                        Appoint clan administration
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
                        <input
                          value={
                            managerUid[clan.id] ||
                            ""
                          }
                          onChange={(event) =>
                            setManagerUid(
                              (current) => ({
                                ...current,
                                [clan.id]:
                                  event.target
                                    .value,
                              }),
                            )
                          }
                          placeholder="AoE2WAR user UID"
                          className="rounded-xl border border-white/10 bg-stone-950 px-3 py-2 text-sm"
                        />
                        <select
                          value={
                            managerRole[
                              clan.id
                            ] || "admin"
                          }
                          onChange={(event) =>
                            setManagerRole(
                              (current) => ({
                                ...current,
                                [clan.id]:
                                  event.target
                                    .value,
                              }),
                            )
                          }
                          className="rounded-xl border border-white/10 bg-stone-950 px-3 py-2 text-sm"
                        >
                          <option value="owner">
                            Owner
                          </option>
                          <option value="admin">
                            Admin
                          </option>
                          <option value="member">
                            Member
                          </option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            void setManager(clan)
                          }
                          disabled={
                            busy ===
                            `manager:${clan.id}`
                          }
                          className="rounded-xl bg-red-700 px-4 text-xs font-black text-white disabled:opacity-45"
                        >
                          Save
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {clan.managers.length ===
                        0 ? (
                          <span className="text-xs text-stone-600">
                            No owner/admin assigned
                          </span>
                        ) : (
                          clan.managers.map(
                            (manager) => (
                              <span
                                key={`${manager.uid}-${manager.role}`}
                                className="inline-flex items-center gap-1 rounded-full border border-white/9 bg-white/[0.03] px-3 py-1 text-xs text-stone-300"
                              >
                                <Crown className="h-3.5 w-3.5 text-amber-200" />
                                {
                                  manager.displayName
                                }{" "}
                                · {manager.role}
                              </span>
                            ),
                          )
                        )}
                      </div>
                    </section>
                  </div>

                  <section className="mt-5">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-600">
                      Assigned crest library
                    </div>
                    {clan.crestOptions.length ===
                    0 ? (
                      <div className="mt-3 rounded-xl border border-dashed border-white/8 px-4 py-5 text-sm text-stone-600">
                        No crests assigned yet.
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                        {clan.crestOptions.map(
                          (asset) => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() =>
                                void selectCurrentCrest(
                                  clan,
                                  asset,
                                )
                              }
                              className={`group cursor-pointer overflow-hidden rounded-xl border p-2 text-left ${
                                asset.current ||
                                asset.url ===
                                  clan.crestUrl
                                  ? "border-amber-200/45 bg-amber-300/[0.07]"
                                  : "border-white/8 bg-white/[0.025] hover:border-red-200/25"
                              }`}
                            >
                              <div className="relative aspect-square overflow-hidden rounded-lg bg-black/40">
                                <img
                                  src={asset.url}
                                  alt={
                                    asset.alt ||
                                    asset.label
                                  }
                                  className="h-full w-full object-cover"
                                />
                                {asset.current ||
                                asset.url ===
                                  clan.crestUrl ? (
                                  <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-amber-300 text-stone-950">
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-stone-400">
                                {asset.label}
                              </div>
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
