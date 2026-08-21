"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type ContextManifestItem = {
  key: string;
  label: string;
  mode:
    | "always"
    | "keyword-gated"
    | "bounded"
    | "excluded";
};

type Repository = {
  id: string;
  label: string;
  description: string;
  pagePaths: readonly string[];
  guidance: string;
  priority: number;
};

type AccessProfile = {
  key: string;
  kind: "public_lobby" | "clan_hall";
  displayName: string;
  mention: string | null;
  source: "lobby_public" | "clan_hall";
  configurationMode:
    | "dedicated"
    | "inherits"
    | "missing";
  configuredAgentSlug: string;
  configuredKnowledgeScopes: string[];
  routableRepositoryIds: string[];
  additiveContext: string[];
  excludedContext: string[];
  contextManifest: ContextManifestItem[];
  hall: {
    slug: string;
    name: string;
    crestUrl: string | null;
  } | null;
};

type Topology = {
  ok: true;
  generatedAt: string;
  routingMode: string;
  repositories: Repository[];
  publicPages: Array<{
    path: string;
    label: string;
    repository: string;
  }>;
  accessProfiles: AccessProfile[];
};

type Inspection = {
  ok: true;
  query: string;
  source: string;
  selectedRepositories: string[];
  traces: Array<{
    id: string;
    status: string;
    ms: number;
    chars: number;
    detail: string | null;
  }>;
  contextPreview: string;
};

function modeTone(mode: ContextManifestItem["mode"]) {
  if (mode === "excluded") {
    return "border-slate-500/20 bg-slate-800/70 text-slate-400";
  }
  if (mode === "always") {
    return "border-emerald-200/20 bg-emerald-300/8 text-emerald-100";
  }
  if (mode === "bounded") {
    return "border-amber-200/20 bg-amber-300/8 text-amber-100";
  }
  return "border-violet-200/20 bg-violet-300/8 text-violet-100";
}

export default function KingdomKnowledgeRouterPanel() {
  const [topology, setTopology] =
    useState<Topology | null>(null);
  const [selectedKey, setSelectedKey] =
    useState<string | null>(null);
  const [query, setQuery] = useState(
    "Who is online right now?",
  );
  const [inspection, setInspection] =
    useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void fetch(
      "/api/admin/ai-knowledge/topology",
      { cache: "no-store" },
    )
      .then(async (response) => {
        const payload =
          (await response.json().catch(
            () => null,
          )) as
            | Topology
            | { detail?: string }
            | null;
        if (
          !response.ok ||
          !payload ||
          !("accessProfiles" in payload)
        ) {
          throw new Error(
            payload &&
              "detail" in payload &&
              payload.detail
              ? payload.detail
              : "Could not load Kingdom Knowledge Router topology.",
          );
        }
        if (disposed) return;
        setTopology(payload);
        setSelectedKey(
          (current) =>
            current ??
            payload.accessProfiles[0]?.key ??
            null,
        );
      })
      .catch((loadError) => {
        if (disposed) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load Kingdom Knowledge Router topology.",
        );
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
    };
  }, []);

  const selected = useMemo(
    () =>
      topology?.accessProfiles.find(
        (profile) =>
          profile.key === selectedKey,
      ) ?? null,
    [selectedKey, topology],
  );

  async function inspect() {
    if (!selected || inspecting) return;
    setInspecting(true);
    setError(null);
    setInspection(null);

    try {
      const params = new URLSearchParams({
        source: selected.source,
        q:
          query.trim() ||
          "What can the Kingdom Knowledge Router answer?",
      });
      const response = await fetch(
        `/api/admin/ai-knowledge?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload =
        (await response.json().catch(
          () => null,
        )) as
          | Inspection
          | { detail?: string }
          | null;
      if (
        !response.ok ||
        !payload ||
        !("selectedRepositories" in payload)
      ) {
        throw new Error(
          payload &&
            "detail" in payload &&
            payload.detail
            ? payload.detail
            : "KKR inspection failed.",
        );
      }
      setInspection(payload);
    } catch (inspectError) {
      setError(
        inspectError instanceof Error
          ? inspectError.message
          : "KKR inspection failed.",
      );
    } finally {
      setInspecting(false);
    }
  }

  return (
    <section className="space-y-5 rounded-[1.8rem] border border-violet-200/14 bg-[radial-gradient(circle_at_0%_0%,rgba(139,92,246,0.12),transparent_32%),rgba(2,6,23,0.76)] p-5 sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-200/60">
            Kingdom Intelligence Plane
          </div>
          <h2 className="mt-2 font-serif text-3xl">
            Kingdom Knowledge Router
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Read-only visibility into every public KKR repository,
            which AI lanes can route to it, and which Hall-only or
            private context is added or excluded.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-lg font-black text-white">
              {topology?.repositories.length ?? "…"}
            </div>
            <div className="text-slate-500">repositories</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-lg font-black text-white">
              {topology?.publicPages.length ?? "…"}
            </div>
            <div className="text-slate-500">public pages</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-2">
            <div className="text-lg font-black text-white">
              {topology?.accessProfiles.length ?? "…"}
            </div>
            <div className="text-slate-500">AI lanes</div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">
          Mapping Kingdom intelligence…
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="space-y-2">
          {(topology?.accessProfiles ?? []).map(
            (profile) => (
              <button
                key={profile.key}
                type="button"
                onClick={() => {
                  setSelectedKey(profile.key);
                  setInspection(null);
                }}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  selectedKey === profile.key
                    ? "border-violet-200/30 bg-violet-300/10"
                    : "border-white/8 bg-black/20 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-white">
                    {profile.displayName}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.15em] text-violet-200/65">
                    {profile.mention ?? "Lobby"}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {profile.source} · {profile.configurationMode}
                </div>
              </button>
            ),
          )}
        </div>

        {selected ? (
          <div className="space-y-4 rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {selected.displayName}
                  {selected.mention
                    ? ` · ${selected.mention}`
                    : ""}
                </h3>
                <div className="mt-1 text-xs text-slate-500">
                  Config: {selected.configuredAgentSlug} ·{" "}
                  {selected.configurationMode}
                </div>
              </div>
              <div className="rounded-full border border-emerald-200/18 bg-emerald-300/8 px-3 py-1 text-xs font-bold text-emerald-100">
                {selected.routableRepositoryIds.length}/
                {topology?.repositories.length ?? 0} KKR routable
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Additive context
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.additiveContext.map(
                  (label) => (
                    <span
                      key={label}
                      className="rounded-full border border-cyan-200/16 bg-cyan-300/7 px-2.5 py-1 text-xs text-cyan-100"
                    >
                      {label}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                Effective context contract
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.contextManifest.map(
                  (item) => (
                    <span
                      key={item.key}
                      title={item.key}
                      className={`rounded-full border px-2.5 py-1 text-xs ${modeTone(item.mode)}`}
                    >
                      {item.label} · {item.mode}
                    </span>
                  ),
                )}
              </div>
            </div>

            {selected.configuredKnowledgeScopes.length ? (
              <div className="text-xs text-slate-400">
                Stored knowledge scopes:{" "}
                {selected.configuredKnowledgeScopes.join(", ")}
              </div>
            ) : (
              <div className="text-xs text-amber-100/70">
                No stored knowledge-scope labels. Runtime KKR access above
                is derived from the actual source lane and router contract.
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">
              KKR repository estate
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Eligible does not mean injected on every request. KKR routes
              only the repositories relevant to the question.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            {topology?.routingMode}
          </div>
        </div>

        <div className="mt-3 grid max-h-[34rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
          {(topology?.repositories ?? []).map(
            (repository) => (
              <div
                key={repository.id}
                className="rounded-xl border border-white/8 bg-black/20 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-white">
                    {repository.label}
                  </div>
                  <code className="text-[10px] text-violet-200/70">
                    {repository.id}
                  </code>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  {repository.description}
                </p>
                <div className="mt-2 text-[10px] leading-4 text-slate-600">
                  {repository.pagePaths.length
                    ? repository.pagePaths.join(" · ")
                    : "No direct page path"}
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[16rem] flex-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Test this AI lane against KKR
            </span>
            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void inspect();
                }
              }}
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-violet-200/30"
            />
          </label>
          <button
            type="button"
            onClick={() => void inspect()}
            disabled={!selected || inspecting}
            className="h-11 rounded-xl bg-violet-200 px-4 text-sm font-black text-slate-950 disabled:opacity-45"
          >
            {inspecting ? "Routing…" : "Inspect routing"}
          </button>
        </div>

        {inspection ? (
          <div className="mt-4 space-y-3">
            <div className="text-sm text-white">
              Selected repositories:{" "}
              <strong>
                {inspection.selectedRepositories.length
                  ? inspection.selectedRepositories.join(", ")
                  : "none"}
              </strong>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {inspection.traces.map((trace) => (
                <div
                  key={trace.id}
                  className="rounded-lg border border-white/8 bg-slate-950/70 px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-white">
                    {trace.id}
                  </span>{" "}
                  <span className="text-slate-500">
                    {trace.status} · {trace.ms}ms · {trace.chars} chars
                  </span>
                </div>
              ))}
            </div>
            <details className="rounded-xl border border-white/8 bg-slate-950/70 p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
                Bounded context preview
              </summary>
              <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-300">
                {inspection.contextPreview}
              </pre>
            </details>
          </div>
        ) : null}
      </div>
    </section>
  );
}
