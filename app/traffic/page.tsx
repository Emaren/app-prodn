"use client";
import { useEffect, useState } from "react";

type Summary = {
  real_24h: number;
  repeat: number;
  bot: number;
  suspicious: number;
  unknown: number;
  total_all_time_ips: number;
  top_repeat_ips: [string, number][];
  top_countries: [string, number][];
};

type TrafficStats = {
  postgres_total: number;
  profile_gap_count: number;
  profile_gap_uids: string[];
  missing_email_count: number;
  missing_name_count: number;
  traffic_log: string;
  summary: Summary;
};

const SUMMARY_DEFAULTS: Summary = {
  real_24h: 0,
  repeat: 0,
  bot: 0,
  suspicious: 0,
  unknown: 0,
  total_all_time_ips: 0,
  top_repeat_ips: [],
  top_countries: [],
};

export default function TrafficPage() {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [showMoreCountries, setShowMoreCountries] = useState(false);
  const [showMoreIPs, setShowMoreIPs] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/traffic`);
        const data = await res.json();
        setStats(data as TrafficStats);
      } catch (err) {
        console.error("Failed to fetch traffic data:", err);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <p className="p-4">Loading traffic data...</p>;

  const summary = stats.summary || SUMMARY_DEFAULTS;
  const countryFlag = (name: string) =>
    ({
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
    }[name] || "🌐");

  const format = (value: number, colorClass: string) => (
    <span className={`${colorClass} font-semibold`}>{value}</span>
  );

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">🔍 Traffic Monitor</h1>

      <div className="space-y-1">
        <p>🐘 Postgres users: {stats.postgres_total}</p>
        <p className="text-red-500">⚠️ Users with profile gaps: {stats.profile_gap_count}</p>
        <p>📭 Missing email: {stats.missing_email_count}</p>
        <p>🎮 Missing in-game name: {stats.missing_name_count}</p>
        <ul className="text-sm text-gray-300">
          {stats.profile_gap_uids.map((uid: string) => (
            <li key={uid}>🆔 {uid}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* 📊 Summary */}
        <div className="rounded-xl border border-gray-600 p-4 bg-[#111827] shadow-md">
          <h2 className="text-lg font-semibold mb-2">📊 Traffic Summary</h2>
          <p>👥 Real Users (last 24h): {format(summary.real_24h, "text-green-400")}</p>
          <p>🔁 Repeat Visitors: {format(summary.repeat, "text-blue-400")}</p>
          <p>🤖 Bots: {format(summary.bot, "text-yellow-400")}</p>
          <p>⚠️ Suspicious: {format(summary.suspicious, "text-red-400")}</p>
          <p>❓ Unknown: {format(summary.unknown, "text-gray-400")}</p>
          <p>📈 Total Visitors Since Launch: {format(summary.total_all_time_ips, "text-blue-400")}</p>
        </div>

        {/* 🌍 Countries + 👤 Repeat IPs */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1">
          <div className="bg-[#111827] p-4 rounded-xl border border-[#2d2d2d] w-full">
            <h2 className="text-lg font-bold mb-2">🌍 Top Countries</h2>
            <ul className="text-sm space-y-1">
              {(showMoreCountries ? summary.top_countries : summary.top_countries.slice(0, 5)).map(
                ([country, count]: [string, number], i: number) => (
                  <li key={i}>
                    {countryFlag(country)} {country}: {count}
                  </li>
                )
              )}
            </ul>
            {summary.top_countries.length > 5 && (
              <button
                className="text-xs mt-2 text-blue-400 hover:underline"
                onClick={() => setShowMoreCountries(!showMoreCountries)}
              >
                {showMoreCountries ? "Show Less" : "Show More"}
              </button>
            )}
          </div>

          <div className="bg-[#111827] p-4 rounded-xl border border-[#2d2d2d] w-full">
            <h2 className="text-lg font-bold mb-2">👤 Top Repeat Visitors</h2>
            <ul className="text-sm space-y-1">
              {(showMoreIPs ? summary.top_repeat_ips : summary.top_repeat_ips.slice(0, 3)).map(
                ([ip, count]: [string, number], i: number) => (
                  <li key={i}>
                    {countryFlag(stats.summary.top_countries?.[0]?.[0] || "")} {ip} →{" "}
                    <span className="text-blue-400">{count}</span> visits
                  </li>
                )
              )}
            </ul>
            {summary.top_repeat_ips.length > 3 && (
              <button
                className="text-xs mt-2 text-blue-400 hover:underline"
                onClick={() => setShowMoreIPs(!showMoreIPs)}
              >
                {showMoreIPs ? "Show Less" : "Show More"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 🔽 Log Output */}
      <div className="bg-black p-4 rounded-xl text-green-400 text-xs whitespace-pre-wrap overflow-auto border border-[#2d2d2d]">
        <h2 className="text-lg font-bold mb-2 text-white">📜 Recent Traffic Log</h2>
        <code>{stats.traffic_log}</code>
      </div>
    </div>
  );
}
