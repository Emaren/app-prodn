"use client";

import { useMemo, useState } from "react";
import { Crown, FileCheck2, History, Medal, Shield, Sparkles } from "lucide-react";

import {
  allChampionTitles,
  designationTitles,
  tributeLabel,
  type ChampionTitleDefinition,
} from "@/lib/champions/titles";

type AssignmentMode = "assign" | "vacate" | "record" | "contenders";

function titleLabel(title: ChampionTitleDefinition) {
  const suffix =
    title.type === "designation"
      ? "Artifact"
      : title.type === "national"
        ? "National"
        : title.type === "elo"
          ? "ELO"
          : "Belt";
  return `${title.displayName} (${suffix})`;
}

export default function ChampionTitleAdminScaffold() {
  const [selectedTitleId, setSelectedTitleId] = useState(allChampionTitles[0]?.id ?? "");
  const [mode, setMode] = useState<AssignmentMode>("assign");
  const [holderName, setHolderName] = useState("");
  const [recordValue, setRecordValue] = useState("");
  const [takenFrom, setTakenFrom] = useState("");
  const [proof, setProof] = useState("");

  const selectedTitle = useMemo(
    () => allChampionTitles.find((title) => title.id === selectedTitleId) ?? allChampionTitles[0],
    [selectedTitleId]
  );

  const designationCount = designationTitles.length;

  return (
    <section className="rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.14),_transparent_30%),linear-gradient(135deg,_rgba(15,23,42,0.78),_rgba(2,6,23,0.94))] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-amber-100/70">
            <Crown className="h-4 w-4" />
            Title Control Scaffold
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Manual belts and artifacts</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
            App-side admin surface for holder assignment, vacancies, record values, contender ordering, proof links,
            and future held-since / taken-from history. Persistence is intentionally reserved for the next storage pass.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Belts" value={String(allChampionTitles.length - designationCount)} />
          <Stat label="Artifacts" value={String(designationCount)} />
          <Stat label="Daily Labels" value="Ready" />
          <Stat label="Storage" value="Scaffold" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-200">Belt / Artifact</span>
            <select
              value={selectedTitleId}
              onChange={(event) => setSelectedTitleId(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/45"
            >
              {allChampionTitles.map((title) => (
                <option key={title.id} value={title.id}>
                  {titleLabel(title)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { key: "assign", label: "Assign", icon: Shield },
              { key: "vacate", label: "Vacate", icon: Crown },
              { key: "record", label: "Record", icon: Medal },
              { key: "contenders", label: "Top 10", icon: History },
            ].map((item) => {
              const Icon = item.icon;
              const active = mode === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setMode(item.key as AssignmentMode)}
                  className={`rounded-2xl border px-3 py-3 text-left transition ${
                    active
                      ? "border-amber-200/28 bg-amber-300/12 text-amber-100"
                      : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <div className="mt-2 text-sm font-semibold">{item.label}</div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Holder / Team</span>
              <input
                value={holderName}
                onChange={(event) => setHolderName(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/45"
                placeholder="Player or pair"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Taken From</span>
              <input
                value={takenFrom}
                onChange={(event) => setTakenFrom(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/45"
                placeholder="Previous holder"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Record Value</span>
              <input
                value={recordValue}
                onChange={(event) => setRecordValue(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/45"
                placeholder="e.g. +312 ELO upset"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">Game / Replay Proof</span>
              <input
                value={proof}
                onChange={(event) => setProof(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/45"
                placeholder="Game ID, tx, replay URL"
              />
            </label>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
            <FileCheck2 className="h-4 w-4" />
            Operator Preview
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-white">{selectedTitle.displayName}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Preview label="Action" value={mode} />
            <Preview label="Payout label" value={tributeLabel(selectedTitle.tributeKind)} />
            <Preview label="Daily amount" value={`${selectedTitle.dailyWolo} WOLO/day`} />
            <Preview label="Current holder" value={selectedTitle.holders[0]?.name || "Vacant"} />
            <Preview label="Metric key" value={selectedTitle.metricKey || "title_result"} />
            <Preview label="Proof attached" value={proof ? "Ready" : "Waiting"} />
          </div>
          <div className="mt-4 rounded-2xl border border-amber-200/14 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50/90">
            This pass creates the operator surface and future-safe fields. Save buttons are intentionally disabled
            until the title-holder storage model lands.
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 opacity-50"
            >
              Save Assignment
            </button>
            <button
              type="button"
              disabled
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/60"
            >
              Reorder Top 10
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <RailNote icon={Shield} title="Assign / Vacate" body="Holder, taken-from, held-since, proof, and current state." />
        <RailNote icon={Sparkles} title="Artifacts" body="Record value, metric key, proof game, and current holder." />
        <RailNote icon={History} title="Manual Top 10" body="Chaos, Women's, Tag Team, and empty parser lanes can be ordered by Tony first." />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-amber-100">{value}</div>
    </div>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function RailNote({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/16 bg-amber-300/10 text-amber-100">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-400">{body}</div>
      </div>
    </div>
  );
}
