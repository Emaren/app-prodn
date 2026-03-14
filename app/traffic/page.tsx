"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

const BUILD_MARKER = "traffic-ui-canary-2026-03-13-01";

type LegacyPair = [string, number];

type CountRow = {
  label: string;
  count: number;
};

type IpRow = {
  ip: string;
  count: number;
  country: string;
  category: string;
  last_seen: string | null;
};

type LogEntry = {
  ts: string;
  ip: string;
  host?: string;
  category: string;
  method: string;
  path: string;
  status: number;
  referrer: string;
  country: string;
  ua: string;
  raw: string;
};

type HostCounterMap = Record<string, CountRow[]>;

type HostFocus = {
  host: string;
  aliases: string[];
  unique_ips_24h: number;
  unique_human_ips_24h: number;
  unique_bot_ips_24h: number;
  unique_suspicious_ips_24h: number;
  unique_unknown_ips_24h: number;
  total_requests_24h: number;
  human_requests_24h: number;
  bot_requests_24h: number;
  suspicious_requests_24h: number;
  unknown_requests_24h: number;
};

type Summary = {
  real_24h: number;
  repeat: number;
  bot: number;
  suspicious: number;
  unknown: number;
  total_all_time_ips: number;
  total_seen_requests?: number;
  total_requests_24h?: number;
  last_log_time?: string | null;
  top_repeat_ips?: LegacyPair[];
  top_repeat_ips_detailed?: IpRow[];
  top_ips_24h?: IpRow[];
  top_countries?: LegacyPair[];
  top_countries_human_24h?: CountRow[];
  top_countries_all_24h?: CountRow[];
  top_paths_24h?: CountRow[];
  top_suspicious_paths_24h?: CountRow[];
  top_referrers_24h?: CountRow[];
  status_counts_24h?: CountRow[];
  method_counts_24h?: CountRow[];
  category_request_counts_24h?: CountRow[];
  top_hosts_24h?: CountRow[];
  top_human_hosts_24h?: CountRow[];
  top_suspicious_hosts_24h?: CountRow[];
  host_unique_ips_24h?: CountRow[];
  host_unique_human_ips_24h?: CountRow[];
  host_unique_suspicious_ips_24h?: CountRow[];
  top_paths_by_host_24h?: HostCounterMap;
  top_suspicious_paths_by_host_24h?: HostCounterMap;
  top_referrers_by_host_24h?: HostCounterMap;
  primary_host_aliases?: string[];
  primary_host_focus?: HostFocus;
};

type TrafficStats = {
  generated_at?: string;
  postgres_total: number;
  profile_gap_count: number;
  profile_gap_uids?: string[];
  missing_email_count: number;
  missing_name_count: number;
  traffic_log: string;
  recent_entries?: LogEntry[];
  summary: Summary;
  error?: string;
};

const SUMMARY_DEFAULTS: Summary = {
  real_24h: 0,
  repeat: 0,
  bot: 0,
  suspicious: 0,
  unknown: 0,
  total_all_time_ips: 0,
  total_seen_requests: 0,
  total_requests_24h: 0,
  last_log_time: null,
  top_repeat_ips: [],
  top_repeat_ips_detailed: [],
  top_ips_24h: [],
  top_countries: [],
  top_countries_human_24h: [],
  top_countries_all_24h: [],
  top_paths_24h: [],
  top_suspicious_paths_24h: [],
  top_referrers_24h: [],
  status_counts_24h: [],
  method_counts_24h: [],
  category_request_counts_24h: [],
  top_hosts_24h: [],
  top_human_hosts_24h: [],
  top_suspicious_hosts_24h: [],
  host_unique_ips_24h: [],
  host_unique_human_ips_24h: [],
  host_unique_suspicious_ips_24h: [],
  top_paths_by_host_24h: {},
  top_suspicious_paths_by_host_24h: {},
  top_referrers_by_host_24h: {},
  primary_host_aliases: ["aoe2hdbets.com", "www.aoe2hdbets.com"],
  primary_host_focus: {
    host: "aoe2hdbets.com",
    aliases: ["aoe2hdbets.com", "www.aoe2hdbets.com"],
    unique_ips_24h: 0,
    unique_human_ips_24h: 0,
    unique_bot_ips_24h: 0,
    unique_suspicious_ips_24h: 0,
    unique_unknown_ips_24h: 0,
    total_requests_24h: 0,
    human_requests_24h: 0,
    bot_requests_24h: 0,
    suspicious_requests_24h: 0,
    unknown_requests_24h: 0,
  },
};

function asCountRows(value: unknown): CountRow[] {
  return Array.isArray(value) ? (value as CountRow[]) : [];
}

function asIpRows(value: unknown): IpRow[] {
  return Array.isArray(value) ? (value as IpRow[]) : [];
}

function asHostCounterMap(value: unknown): HostCounterMap {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as HostCounterMap)
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-950/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] ${className}`}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  accentClass,
  sublabel,
  className = "",
}: {
  label: string;
  value: string | number;
  accentClass: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-800 bg-slate-950/80 p-4 ${className}`}>
      <p className="text-sm leading-5 text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${accentClass}`}>{value}</p>
      {sublabel ? <p className="mt-2 text-xs leading-5 text-slate-500">{sublabel}</p> : null}
    </div>
  );
}

function countryFlag(name: string) {
  const normalized = name.trim();
  return (
    {
      "United States": "🇺🇸",
      Canada: "🇨🇦",
      Sweden: "🇸🇪",
      Germany: "🇩🇪",
      Japan: "🇯🇵",
      Nigeria: "🇳🇬",
      China: "🇨🇳",
      France: "🇫🇷",
      India: "🇮🇳",
      "United Kingdom": "🇬🇧",
      "South Korea": "🇰🇷",
      "Republic of Korea": "🇰🇷",
      Netherlands: "🇳🇱",
      Belgium: "🇧🇪",
      Pakistan: "🇵🇰",
      Bulgaria: "🇧🇬",
      Lithuania: "🇱🇹",
      Ghana: "🇬🇭",
      Singapore: "🇸🇬",
      "Czech Republic": "🇨🇿",
      "Hong Kong": "🇭🇰",
      "South Africa": "🇿🇦",
      Australia: "🇦🇺",
      Italy: "🇮🇹",
      Spain: "🇪🇸",
      Poland: "🇵🇱",
      Brazil: "🇧🇷",
      Mexico: "🇲🇽",
      Austria: "🇦🇹",
      Switzerland: "🇨🇭",
      Romania: "🇷🇴",
      Norway: "🇳🇴",
      Finland: "🇫🇮",
      Denmark: "🇩🇰",
      Ukraine: "🇺🇦",
      Turkey: "🇹🇷",
      "New Zealand": "🇳🇿",
    }[normalized] || "🌐"
  );
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatTimestamp(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function categoryPillClass(category: string) {
  switch (category) {
    case "human":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
    case "bot":
      return "bg-yellow-500/15 text-yellow-300 border-yellow-500/20";
    case "suspicious":
      return "bg-rose-500/15 text-rose-300 border-rose-500/20";
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-500/20";
  }
}

function HostList({
  rows,
  accentClass,
  emptyText,
}: {
  rows: CountRow[];
  accentClass: string;
  emptyText: string;
}) {
  if (!rows.length) {
    return <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">{emptyText}</div>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={`${row.label}-${row.count}`}
          className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
        >
          <span className="min-w-0 flex-1 truncate text-slate-200">{row.label}</span>
          <span className={`shrink-0 font-semibold ${accentClass}`}>{formatNumber(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

function HostMapPanel({
  data,
  emptyText,
  accentClass,
  valueLabel,
}: {
  data: HostCounterMap;
  emptyText: string;
  accentClass: string;
  valueLabel: string;
}) {
  const hosts = Object.entries(data);

  if (!hosts.length) {
    return <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">{emptyText}</div>;
  }

  return (
    <div className="space-y-4">
      {hosts.map(([host, rows]) => (
        <div key={host} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="min-w-0 flex-1 truncate font-semibold text-slate-100">{host}</h3>
            <span className="shrink-0 text-xs uppercase tracking-wide text-slate-500">
              {valueLabel}
            </span>
          </div>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={`${host}-${row.label}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/70 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-slate-200">{row.label}</span>
                <span className={`shrink-0 font-semibold ${accentClass}`}>{formatNumber(row.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function TrafficPage() {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showMoreCountries, setShowMoreCountries] = useState(false);
  const [showMoreLiveIps, setShowMoreLiveIps] = useState(false);
  const [showMoreAllTimeIps, setShowMoreAllTimeIps] = useState(false);
  const [logFilter, setLogFilter] = useState("");
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/traffic", { cache: "no-store" });
        const data = (await res.json()) as TrafficStats;

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch traffic data.");
        }

        if (!active) return;
        setStats(data);
        setFetchError(null);
      } catch (err) {
        console.error("Failed to fetch traffic data:", err);
        if (!active) return;
        setFetchError(err instanceof Error ? err.message : "Failed to fetch traffic data.");
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const summary =
    stats?.summary && typeof stats.summary === "object"
      ? { ...SUMMARY_DEFAULTS, ...stats.summary }
      : SUMMARY_DEFAULTS;

  const allTimeIps: IpRow[] = useMemo(() => {
    const detailed = asIpRows(summary.top_repeat_ips_detailed);
    if (detailed.length) return detailed;

    return (summary.top_repeat_ips || []).map(([ip, count]) => ({
      ip,
      count,
      country: "??",
      category: "unknown",
      last_seen: null,
    }));
  }, [summary.top_repeat_ips, summary.top_repeat_ips_detailed]);

  const liveIps: IpRow[] = useMemo(() => asIpRows(summary.top_ips_24h), [summary.top_ips_24h]);

  const humanCountries: CountRow[] = useMemo(() => {
    const rows = asCountRows(summary.top_countries_human_24h);
    if (rows.length) return rows;
    return (summary.top_countries || []).map(([label, count]) => ({ label, count }));
  }, [summary.top_countries, summary.top_countries_human_24h]);

  const allCountries: CountRow[] = asCountRows(summary.top_countries_all_24h);
  const topPaths: CountRow[] = asCountRows(summary.top_paths_24h);
  const suspiciousPaths: CountRow[] = asCountRows(summary.top_suspicious_paths_24h);
  const topReferrers: CountRow[] = asCountRows(summary.top_referrers_24h);
  const statusCounts: CountRow[] = asCountRows(summary.status_counts_24h);
  const methodCounts: CountRow[] = asCountRows(summary.method_counts_24h);
  const categoryRequestCounts: CountRow[] = asCountRows(summary.category_request_counts_24h);

  const topHosts: CountRow[] = asCountRows(summary.top_hosts_24h);
  const topHumanHosts: CountRow[] = asCountRows(summary.host_unique_human_ips_24h);
  const topSuspiciousHosts: CountRow[] = asCountRows(summary.host_unique_suspicious_ips_24h);

  const topPathsByHost: HostCounterMap = asHostCounterMap(summary.top_paths_by_host_24h);
  const topSuspiciousPathsByHost: HostCounterMap = asHostCounterMap(
    summary.top_suspicious_paths_by_host_24h
  );
  const topReferrersByHost: HostCounterMap = asHostCounterMap(summary.top_referrers_by_host_24h);

  const primaryHostFocus: HostFocus =
    summary.primary_host_focus && typeof summary.primary_host_focus === "object"
      ? summary.primary_host_focus
      : SUMMARY_DEFAULTS.primary_host_focus!;

  const primaryAliases =
    Array.isArray(summary.primary_host_aliases) && summary.primary_host_aliases.length > 0
      ? summary.primary_host_aliases
      : SUMMARY_DEFAULTS.primary_host_aliases!;

  const profileGapUids = useMemo(() => asStringArray(stats?.profile_gap_uids), [stats?.profile_gap_uids]);

  const rawLogLines = useMemo(() => {
    if (typeof stats?.traffic_log === "string" && stats.traffic_log.trim()) {
      return stats.traffic_log
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean);
    }
    return [];
  }, [stats?.traffic_log]);

  const filteredLogLines = useMemo(() => {
    if (!logFilter.trim()) return rawLogLines;
    const needle = logFilter.toLowerCase();
    return rawLogLines.filter((line) => line.toLowerCase().includes(needle));
  }, [logFilter, rawLogLines]);

  const handleCopyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      window.setTimeout(() => {
        setCopiedUid((current) => (current === uid ? null : current));
      }, 1500);
    } catch (error) {
      console.error("Failed to copy uid:", error);
    }
  };

  if (!stats && fetchError) {
    return (
      <div className="min-h-screen bg-[#050816] p-6 text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6">
          <h1 className="text-2xl font-semibold">Traffic Command Center</h1>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">{BUILD_MARKER}</p>
          <p className="mt-3 text-rose-300">{fetchError}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[#050816] p-6 text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
          <h1 className="text-2xl font-semibold">Traffic Command Center</h1>
          <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">{BUILD_MARKER}</p>
          <p className="mt-3 text-slate-300">Loading traffic command center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Traffic Command Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Unified VPS traffic across hosted projects. This page now understands hosts too, so you
              can see which domains are active, which ones are getting real people, and which ones are
              drawing probes and trash.
            </p>
            <div className="mt-3 inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Live build marker: {BUILD_MARKER}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-300">
            <p>
              <span className="text-slate-500">Last refresh:</span>{" "}
              <span className="font-medium text-slate-100">{formatTimestamp(stats.generated_at)}</span>
            </p>
            <p className="mt-1">
              <span className="text-slate-500">Newest log seen:</span>{" "}
              <span className="font-medium text-slate-100">{formatTimestamp(summary.last_log_time)}</span>
            </p>
          </div>
        </header>

        {fetchError ? (
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-950/20 px-4 py-3 text-sm text-yellow-200">
            Latest fetch warning: {fetchError}
          </div>
        ) : null}

        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm leading-6 text-cyan-100">
          This dashboard is intentionally broad right now. It shows combined traffic observed by the VPS
          across your hosted projects so you can map the whole battlefield before splitting this into
          project-specific dashboards later.
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <StatCard
            label="AoE2HD unique human visitors (24h)"
            value={formatNumber(primaryHostFocus.unique_human_ips_24h)}
            accentClass="text-emerald-300"
            sublabel="aoe2hdbets.com + www.aoe2hdbets.com"
            className="border-emerald-500/20 bg-emerald-500/[0.04]"
          />
          <StatCard
            label="AoE2HD total requests (24h)"
            value={formatNumber(primaryHostFocus.total_requests_24h)}
            accentClass="text-cyan-300"
            sublabel="All request volume to the AoE2HD host aliases"
          />
          <StatCard
            label="Shared VPS human-like IPs (24h)"
            value={formatNumber(summary.real_24h)}
            accentClass="text-emerald-300"
            sublabel="Unique browser-looking IPs across all tracked hosts"
          />
          <StatCard
            label="Shared VPS bots (24h)"
            value={formatNumber(summary.bot)}
            accentClass="text-yellow-300"
            sublabel="Unique bot-like IPs across the current window"
          />
          <StatCard
            label="Shared VPS suspicious IPs (24h)"
            value={formatNumber(summary.suspicious)}
            accentClass="text-rose-300"
            sublabel="Unique suspicious IPs across the current window"
          />
          <StatCard
            label="Shared VPS unknown IPs (24h)"
            value={formatNumber(summary.unknown)}
            accentClass="text-slate-300"
            sublabel="Unique IPs that do not cleanly fit a bucket"
          />
          <StatCard
            label="All-time unique IPs seen"
            value={formatNumber(summary.total_all_time_ips)}
            accentClass="text-sky-300"
            sublabel="Persistent IP count across the monitor state"
          />
          <StatCard
            label="All-time seen requests"
            value={formatNumber(summary.total_seen_requests)}
            accentClass="text-indigo-300"
            sublabel="Persistent request count from new log lines"
          />
          <StatCard
            label="Requests in recent window"
            value={formatNumber(summary.total_requests_24h)}
            accentClass="text-fuchsia-300"
            sublabel="Requests represented in the current parsed window"
          />
          <StatCard
            label="Tracked hosts (24h)"
            value={formatNumber(topHosts.length)}
            accentClass="text-cyan-300"
            sublabel="Hosts appearing in the ranked current window"
          />
          <StatCard
            label="Postgres users"
            value={formatNumber(stats.postgres_total)}
            accentClass="text-violet-300"
            sublabel="Users in the AoE2HDBets database"
          />
          <StatCard
            label="Users with profile gaps"
            value={formatNumber(stats.profile_gap_count)}
            accentClass="text-red-300"
            sublabel="Missing email and/or in-game name"
          />
        </div>

        <Panel
          title={`${primaryHostFocus.host} focus (24h)`}
          subtitle={`This is the section you want for unique human visitors to ${primaryHostFocus.host}. Aliases counted here: ${primaryAliases.join(", ")}`}
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label={`${primaryHostFocus.host} unique human visitors`}
              value={formatNumber(primaryHostFocus.unique_human_ips_24h)}
              accentClass="text-emerald-300"
              sublabel="Unique human-looking IPs to your main AoE2HD site"
            />
            <StatCard
              label={`${primaryHostFocus.host} all unique visitors`}
              value={formatNumber(primaryHostFocus.unique_ips_24h)}
              accentClass="text-sky-300"
              sublabel="Unique IPs of every category for the AoE2HD host aliases"
            />
            <StatCard
              label={`${primaryHostFocus.host} human requests`}
              value={formatNumber(primaryHostFocus.human_requests_24h)}
              accentClass="text-cyan-300"
              sublabel="Request volume from human-looking traffic"
            />
            <StatCard
              label={`${primaryHostFocus.host} total requests`}
              value={formatNumber(primaryHostFocus.total_requests_24h)}
              accentClass="text-fuchsia-300"
              sublabel="All request volume for the AoE2HD host aliases"
            />
            <StatCard
              label={`${primaryHostFocus.host} suspicious requests`}
              value={formatNumber(primaryHostFocus.suspicious_requests_24h)}
              accentClass="text-rose-300"
              sublabel="Scanner, exploit, or hostile-looking request volume"
            />
            <StatCard
              label={`${primaryHostFocus.host} bot requests`}
              value={formatNumber(primaryHostFocus.bot_requests_24h)}
              accentClass="text-yellow-300"
              sublabel="Crawler and bot request volume"
            />
          </div>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Top hosts (24h)" subtitle="Highest-volume domains in the current parsed window.">
            <HostList rows={topHosts} accentClass="text-sky-300" emptyText="No host data yet." />
          </Panel>

          <Panel
            title="Top human hosts (24h)"
            subtitle="Unique human-looking visitors by host, not raw request volume."
          >
            <HostList
              rows={topHumanHosts}
              accentClass="text-emerald-300"
              emptyText="No human host data yet."
            />
          </Panel>

          <Panel
            title="Top suspicious hosts (24h)"
            subtitle="Unique suspicious-looking visitors by host."
          >
            <HostList
              rows={topSuspiciousHosts}
              accentClass="text-rose-300"
              emptyText="No suspicious host data yet."
            />
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Live IP activity (24h)" subtitle="The busiest IPs in the current parsed window.">
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">IP</th>
                      <th className="px-4 py-3 text-left font-medium">Country</th>
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                      <th className="px-4 py-3 text-right font-medium">Requests</th>
                      <th className="px-4 py-3 text-left font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {(showMoreLiveIps ? liveIps : liveIps.slice(0, 8)).map((row) => (
                      <tr key={`live-${row.ip}`} className="bg-slate-950/40">
                        <td className="px-4 py-3 font-mono text-slate-100">{row.ip}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {countryFlag(row.country)} {row.country || "??"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${categoryPillClass(
                              row.category
                            )}`}
                          >
                            {row.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-sky-300">
                          {formatNumber(row.count)}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatTimestamp(row.last_seen)}</td>
                      </tr>
                    ))}
                    {liveIps.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                          No live IP activity yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {liveIps.length > 8 ? (
              <button
                className="mt-3 text-sm text-sky-300 hover:text-sky-200"
                onClick={() => setShowMoreLiveIps((current) => !current)}
              >
                {showMoreLiveIps ? "Show fewer live IPs" : "Show more live IPs"}
              </button>
            ) : null}
          </Panel>

          <Panel
            title="All-time heavy hitters"
            subtitle="The most-requesting IPs recorded by the persistent monitor state."
          >
            <div className="overflow-hidden rounded-xl border border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">IP</th>
                      <th className="px-4 py-3 text-left font-medium">Country</th>
                      <th className="px-4 py-3 text-right font-medium">Seen requests</th>
                      <th className="px-4 py-3 text-left font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {(showMoreAllTimeIps ? allTimeIps : allTimeIps.slice(0, 8)).map((row) => (
                      <tr key={`all-${row.ip}`} className="bg-slate-950/40">
                        <td className="px-4 py-3 font-mono text-slate-100">{row.ip}</td>
                        <td className="px-4 py-3 text-slate-300">
                          {countryFlag(row.country)} {row.country || "??"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-indigo-300">
                          {formatNumber(row.count)}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatTimestamp(row.last_seen)}</td>
                      </tr>
                    ))}
                    {allTimeIps.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                          No persistent IP history yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            {allTimeIps.length > 8 ? (
              <button
                className="mt-3 text-sm text-indigo-300 hover:text-indigo-200"
                onClick={() => setShowMoreAllTimeIps((current) => !current)}
              >
                {showMoreAllTimeIps ? "Show fewer all-time IPs" : "Show more all-time IPs"}
              </button>
            ) : null}
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Top countries" subtitle="Human-like countries first, then all recent activity.">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  Human-like countries (24h)
                </p>
                <ul className="space-y-2">
                  {(showMoreCountries ? humanCountries : humanCountries.slice(0, 6)).map((row) => (
                    <li
                      key={`human-country-${row.label}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-slate-200">
                        {countryFlag(row.label)} {row.label}
                      </span>
                      <span className="shrink-0 font-semibold text-emerald-300">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                  {humanCountries.length === 0 ? (
                    <li className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">
                      No country data yet.
                    </li>
                  ) : null}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  All recent countries
                </p>
                <ul className="space-y-2">
                  {allCountries.slice(0, showMoreCountries ? 10 : 4).map((row) => (
                    <li
                      key={`all-country-${row.label}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/40 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-slate-300">
                        {countryFlag(row.label)} {row.label}
                      </span>
                      <span className="shrink-0 font-semibold text-sky-300">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                  {allCountries.length === 0 ? (
                    <li className="rounded-lg bg-slate-900/40 px-3 py-2 text-slate-500">
                      No all-activity country data yet.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            {humanCountries.length > 6 || allCountries.length > 4 ? (
              <button
                className="mt-3 text-sm text-sky-300 hover:text-sky-200"
                onClick={() => setShowMoreCountries((current) => !current)}
              >
                {showMoreCountries ? "Show fewer countries" : "Show more countries"}
              </button>
            ) : null}
          </Panel>

          <Panel
            title="Top referrers (24h)"
            subtitle="Best global growth signal from the shared access log."
          >
            <ul className="space-y-2">
              {topReferrers.slice(0, 10).map((row) => (
                <li
                  key={`ref-${row.label}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-200">{row.label}</span>
                  <span className="shrink-0 font-semibold text-fuchsia-300">
                    {formatNumber(row.count)}
                  </span>
                </li>
              ))}
              {topReferrers.length === 0 ? (
                <li className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">
                  No referrer data yet.
                </li>
              ) : null}
            </ul>
          </Panel>

          <Panel
            title="Top paths (24h)"
            subtitle="Most-requested normalized paths in the current window."
          >
            <ul className="space-y-2">
              {topPaths.slice(0, 10).map((row) => (
                <li
                  key={`path-${row.label}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-slate-200">{row.label}</span>
                  <span className="shrink-0 font-semibold text-sky-300">
                    {formatNumber(row.count)}
                  </span>
                </li>
              ))}
              {topPaths.length === 0 ? (
                <li className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">
                  No path data yet.
                </li>
              ) : null}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="Top paths by host" subtitle="What each ranked host is actually serving.">
            <HostMapPanel
              data={topPathsByHost}
              emptyText="No host path breakdown yet."
              accentClass="text-sky-300"
              valueLabel="requests"
            />
          </Panel>

          <Panel
            title="Top suspicious paths by host"
            subtitle="Host-by-host scanner and exploit heat."
          >
            <HostMapPanel
              data={topSuspiciousPathsByHost}
              emptyText="No suspicious host/path breakdown yet."
              accentClass="text-rose-300"
              valueLabel="hits"
            />
          </Panel>

          <Panel
            title="Top referrers by host"
            subtitle="Where each ranked host is being entered from."
          >
            <HostMapPanel
              data={topReferrersByHost}
              emptyText="No host referrer breakdown yet."
              accentClass="text-fuchsia-300"
              valueLabel="hits"
            />
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <Panel
            title="Suspicious paths (24h)"
            subtitle="Likely probes, scanners, or hostile-looking requests."
            className="xl:col-span-4"
          >
            <ul className="space-y-2">
              {suspiciousPaths.slice(0, 10).map((row) => (
                <li
                  key={`suspicious-${row.label}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-rose-950/20 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-rose-100">{row.label}</span>
                  <span className="shrink-0 font-semibold text-rose-300">
                    {formatNumber(row.count)}
                  </span>
                </li>
              ))}
              {suspiciousPaths.length === 0 ? (
                <li className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">
                  No suspicious paths detected in the current window.
                </li>
              ) : null}
            </ul>
          </Panel>

          <Panel
            title="HTTP picture"
            subtitle="Status codes, methods, and request-category counts from the current window."
            className="xl:col-span-5"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-3">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Statuses</p>
                <ul className="space-y-2">
                  {statusCounts.slice(0, 6).map((row) => (
                    <li
                      key={`status-${row.label}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-slate-200">{row.label}</span>
                      <span className="shrink-0 font-semibold text-sky-300">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Methods</p>
                <ul className="space-y-2">
                  {methodCounts.slice(0, 6).map((row) => (
                    <li
                      key={`method-${row.label}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-slate-200">{row.label}</span>
                      <span className="shrink-0 font-semibold text-violet-300">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="sm:col-span-2 xl:col-span-1">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  Requests by category
                </p>
                <ul className="space-y-2">
                  {categoryRequestCounts.slice(0, 6).map((row) => (
                    <li
                      key={`cat-${row.label}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-slate-200">{row.label}</span>
                      <span className="shrink-0 font-semibold text-cyan-300">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>

          <Panel
            title="User profile quality"
            subtitle="AoE2HDBets account hygiene from Postgres."
            className="xl:col-span-3"
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              <div className="rounded-xl bg-slate-900/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Missing email</p>
                <p className="mt-1 text-xl font-semibold text-amber-300">
                  {formatNumber(stats.missing_email_count)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Missing in-game name</p>
                <p className="mt-1 text-xl font-semibold text-orange-300">
                  {formatNumber(stats.missing_name_count)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-900/70 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Profile gaps</p>
                <p className="mt-1 text-xl font-semibold text-rose-300">
                  {formatNumber(stats.profile_gap_count)}
                </p>
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {profileGapUids.length > 0 ? (
                profileGapUids.map((uid) => (
                  <div
                    key={uid}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/70 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-200">
                      {uid}
                    </span>
                    <button
                      className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
                      onClick={() => handleCopyUid(uid)}
                    >
                      {copiedUid === uid ? "Copied" : "Copy"}
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-lg bg-slate-900/70 px-3 py-2 text-slate-500">
                  No profile gaps detected.
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="Recent traffic log"
          subtitle="Raw combined log view from the current payload, with a quick client-side filter."
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <input
              value={logFilter}
              onChange={(event) => setLogFilter(event.target.value)}
              placeholder="Filter raw log lines by host, path, IP, status, or agent..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500 md:max-w-xl"
            />
            <div className="text-sm text-slate-400">
              Showing <span className="font-semibold text-slate-200">{filteredLogLines.length}</span> of{" "}
              <span className="font-semibold text-slate-200">{rawLogLines.length}</span> lines
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">
            Canary check: if you can see <span className="font-semibold">{BUILD_MARKER}</span> on the live
            page, you are definitely looking at the updated <code className="mx-1">app/traffic/page.tsx</code>.
          </div>

          <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-800 bg-black p-4 text-xs text-emerald-300">
            <code className="whitespace-pre-wrap break-all">
              {filteredLogLines.length > 0
                ? filteredLogLines.join("\n")
                : "No log lines matched the current filter."}
            </code>
          </div>
        </Panel>
      </div>
    </div>
  );
}