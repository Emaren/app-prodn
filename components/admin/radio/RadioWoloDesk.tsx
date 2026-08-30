"use client";

import {
  useState,
} from "react";
import {
  Inbox,
  ListMusic,
  RadioTower,
  Signal,
  Vault,
} from "lucide-react";

import RadioSubmissionInbox from "@/components/admin/radio/RadioSubmissionInbox";
import RadioWoloBuilder from "@/components/admin/radio/RadioWoloBuilder";
import RadioWoloOnAir from "@/components/admin/radio/RadioWoloOnAir";
import RadioWoloVault from "@/components/admin/radio/RadioWoloVault";

type DeskMode =
  | "vault"
  | "build"
  | "on-air"
  | "inbox";

const MODES: Array<{
  id: DeskMode;
  label: string;
  icon:
    typeof Vault;
}> = [
  {
    id: "vault",
    label: "Vault",
    icon: Vault,
  },
  {
    id: "build",
    label: "Build",
    icon: ListMusic,
  },
  {
    id: "on-air",
    label: "On Air",
    icon: Signal,
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
  },
];

export default function RadioWoloDesk() {
  const [
    mode,
    setMode,
  ] = useState<DeskMode>(
    "vault",
  );

  return (
    <main className="mx-auto max-w-[90rem] space-y-5 py-7 text-white">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-fuchsia-100/12 bg-[radial-gradient(circle_at_16%_0%,rgba(217,70,239,0.20),transparent_31%),radial-gradient(circle_at_92%_16%,rgba(245,158,11,0.08),transparent_28%),linear-gradient(145deg,#160818,#060811_60%,#050914)] px-6 py-7 sm:px-9 sm:py-8">
        <div className="pointer-events-none absolute -right-14 -top-20 h-56 w-56 rounded-full border border-fuchsia-100/[0.06]" />
        <div className="pointer-events-none absolute -right-2 -top-8 h-36 w-36 rounded-full border border-fuchsia-100/[0.055]" />

        <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.38em] text-fuchsia-100/60">
              <RadioTower
                size={15}
              />
              Radio WOLO
            </div>

            <h1 className="mt-4 font-serif text-4xl leading-none sm:text-5xl">
              The Kingdom Never
              Goes Silent.
            </h1>

            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
              Private station
              control. Preserve the
              sound, build the chain,
              then put the kingdom
              on air.
            </p>
          </div>

          <div className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-white/8 bg-black/20 p-1.5">
            {MODES.map(
              (item) => {
                const Icon =
                  item.icon;

                const active =
                  mode ===
                  item.id;

                return (
                  <button
                    key={
                      item.id
                    }
                    type="button"
                    onClick={() =>
                      setMode(
                        item.id,
                      )
                    }
                    className={[
                      "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.16em] transition",
                      active
                        ? "bg-fuchsia-100 text-slate-950 shadow-[0_8px_28px_rgba(217,70,239,0.14)]"
                        : "text-slate-500 hover:bg-white/[0.04] hover:text-white",
                    ].join(
                      " ",
                    )}
                  >
                    <Icon
                      size={
                        14
                      }
                    />
                    {
                      item.label
                    }
                  </button>
                );
              },
            )}
          </div>
        </div>
      </section>

      {mode ===
      "vault" ? (
        <RadioWoloVault />
      ) : mode ===
        "build" ? (
        <RadioWoloBuilder />
      ) : mode ===
        "on-air" ? (
        <RadioWoloOnAir />
      ) : (
        <RadioSubmissionInbox />
      )}
    </main>
  );
}
