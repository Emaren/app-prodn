"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ADMIN_ATLAS_ROUTES } from "@/lib/navigationAtlas";
import SiteThemeCampaignPanel from "@/components/admin/command-tower/SiteThemeCampaignPanel";
import { ADMIN_DIRECTORY_SCHEMA, type AdminDirectoryProfile } from "@/lib/adminNonfinancialDirectoryProjection";

type DirectoryPayload = {
  schema: string;
  generatedAt: string;
  summary: {
    registeredAccounts: number;
    verifiedProfiles: number;
    steamLinkedProfiles: number;
  };
  users: AdminDirectoryProfile[];
  unavailable: {
    perAccountAdminRole: string;
    warriorClaimState: string;
    honorsAndClans: string;
    financialAndWolo: string;
    inboxAndTraffic: string;
  };
};

const SCHEMA = ADMIN_DIRECTORY_SCHEMA;

function isDirectoryPayload(input: unknown): input is DirectoryPayload {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<DirectoryPayload>;
  return value.schema === SCHEMA &&
    Boolean(value.summary) &&
    Array.isArray(value.users) &&
    typeof value.summary?.registeredAccounts === "number" &&
    value.users.length === value.summary.registeredAccounts &&
    value.users.every((user) =>
      typeof user.uid === "string" &&
      typeof user.displayName === "string" &&
      typeof user.verified === "boolean" &&
      typeof user.registeredAt === "string",
    ) && value.unavailable?.financialAndWolo === "RESTRICTED";
}

export default function AdminNonfinancialDirectoryPage() {
  const [data, setData] = useState<DirectoryPayload | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/user-directory", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      if (!response.ok) {
        throw new Error(`Admin identity directory unavailable (HTTP ${response.status}).`);
      }
      const payload: unknown = await response.json();
      if (!isDirectoryPayload(payload)) {
        throw new Error("Admin identity directory returned an unexpected contract.");
      }
      setData(payload);
    } catch (caught) {
      if (signal?.aborted) return;
      setData(null);
      setError(caught instanceof Error ? caught.message : "Admin identity directory unavailable.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const results = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.users;
    return data.users.filter((user) =>
      [user.uid, user.displayName, user.inGameName, user.steamPersonaName, user.steamId]
        .some((text) => text?.toLowerCase().includes(term)),
    );
  }, [data, search]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 text-slate-100 sm:px-6">
      <div className="rounded-3xl border border-sky-200/15 bg-slate-950/75 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.23em] text-sky-200/65">
          Community Command Tower · Scoped Identity Reader
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Admin User Directory
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Actual registered accounts from the reviewed, nonfinancial user-profile
          view. Verification is not proof of a claimed warrior, and Steam
          linking is not the same as account registration.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
            Admin Home
          </Link>
          <Link href="/admin/radio" className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
            Radio WOLO Desk
          </Link>
          <button type="button" onClick={() => void refresh()} disabled={loading}
            className="rounded-full border border-amber-200/30 px-4 py-2 text-sm text-amber-100 hover:bg-amber-100/10 disabled:opacity-50">
            {loading ? "Reading…" : "Refresh accounts"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <SiteThemeCampaignPanel />
      </div>

      {error ? (
        <div role="alert" className="mt-6 rounded-2xl border border-rose-300/25 bg-rose-950/30 p-5 text-sm text-rose-100">
          {error} No account counts have been invented.
        </div>
      ) : null}

      {data ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Registered accounts", data.summary.registeredAccounts],
              ["Verified profiles", data.summary.verifiedProfiles],
              ["Steam-linked profiles", data.summary.steamLinkedProfiles],
            ].map(([label, count]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/75 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-amber-200/15 bg-amber-950/15 p-4 text-sm leading-6 text-amber-100/90">
            Warrior claim status, per-account admin roles, clan honors, inbox
            intelligence and financial panels require separate reviewed readers.
            They are <strong>unavailable</strong> here—not zero, missing, or unclaimed.
          </div>

          <section className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Registered accounts</h2>
              <span className="text-xs text-slate-400">
                {results.length} of {data.summary.registeredAccounts} records
              </span>
            </div>
            <label htmlFor="admin-directory-search" className="mt-5 block text-xs uppercase tracking-[0.16em] text-slate-400">
              Search account, Steam ID or warrior name
            </label>
            <input id="admin-directory-search" value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a registered profile"
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/60" />
            <div className="mt-4 grid gap-2">
              {results.map((user) => (
                <article key={user.uid} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:flex sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{user.displayName}</h3>
                    <p className="mt-1 break-all text-xs text-slate-400">Account: {user.uid}</p>
                    {user.steamId ? <p className="mt-1 break-all text-xs text-slate-400">Steam: {user.steamId}</p> : null}
                  </div>
                  <div className="mt-2 shrink-0 text-xs text-slate-300 sm:mt-0 sm:text-right">
                    <p>{user.verified ? "Verified profile" : "Not verified"}</p>
                    <p className="mt-1 text-slate-500">
                      Registered {new Date(user.registeredAt).toLocaleDateString()}
                    </p>
                  </div>
                </article>
              ))}
              {results.length === 0 ? (
                <p className="py-5 text-sm text-slate-400">No account matches that search.</p>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <p className="mt-6 text-sm text-slate-400">
          {loading ? "Reading the approved account directory…" : "The account directory is unavailable."}
        </p>
      )}

      <section className="mt-8 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <h2 className="text-lg font-semibold">Command destinations</h2>
        <p className="mt-2 text-sm text-slate-400">
          Existing private admin districts remain reachable; restricted panels
          do not silently become zero-filled accounts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ADMIN_ATLAS_ROUTES.map((route) => (
            <Link key={route.href} href={route.href}
              className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-300 hover:border-amber-200/40 hover:text-amber-100">
              {route.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
