"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  profileViewFamily,
  type ProfileViewFamily,
  type ProfileViewVariant,
} from "@/lib/profileViewVariant";

const GROUPS: Array<{ family: ProfileViewFamily; label: string; prefix: string }> = [
  { family: "basic", label: "Basic", prefix: "B" },
  { family: "advanced", label: "Advanced", prefix: "A" },
  { family: "extreme", label: "Extreme", prefix: "E" },
];

/**
 * Pointer hover and button click both open the selector.
 * The flyout belongs to the same pointer boundary as its trigger; its
 * transparent padding is a bridge so moving the mouse into 1/2 does not close it.
 * Tab/focus and Escape also work without hover.
 */
export default function ProfileViewSelector({
  value,
  onChange,
}: {
  value: ProfileViewVariant;
  onChange: (value: ProfileViewVariant) => void;
}) {
  const [open, setOpen] = useState<ProfileViewFamily | null>(null);
  const id = useId();
  const family = profileViewFamily(value);

  return (
    <div
      className="relative z-30 inline-flex rounded-full border border-amber-100/15 bg-black/40 p-1 shadow-[0_10px_32px_rgba(0,0,0,.24)]"
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setOpen(null);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(null);
          (event.target as HTMLElement).blur();
        }
      }}
      aria-label="Profile presentation"
    >
      {GROUPS.map((group) => {
        const selected = family === group.family;
        const shown = open === group.family;
        return (
          <div key={group.family} className="relative" onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setOpen(group.family);
          }}>
            <button
              type="button"
              aria-haspopup="true"
              aria-expanded={shown}
              aria-controls={id + "-" + group.prefix}
              onFocus={() => setOpen(group.family)}
              onClick={() => setOpen(group.family)}
              className={"flex items-center gap-1 rounded-full px-3 py-2 text-[10px] font-bold tracking-[.06em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 sm:px-4 " +
                (selected
                  ? "bg-amber-300 text-[#11110f] shadow-[0_8px_24px_rgba(251,191,36,.22)]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white")}
            >
              {group.label}
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
            {shown ? (
              <div
                id={id + "-" + group.prefix}
                className="absolute right-0 top-full z-50 min-w-32 pt-2"
                role="group"
                aria-label={group.label + " layouts"}
              >
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-amber-100/25 bg-[#0d111b] p-2 shadow-[0_22px_70px_rgba(0,0,0,.85)]">
                  {([1, 2] as const).map((version) => {
                    const variant = (group.prefix.toLowerCase() + version) as ProfileViewVariant;
                    const active = value === variant;
                    return (
                      <button
                        key={variant}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          onChange(variant);
                          setOpen(null);
                        }}
                        className={"rounded-xl px-3 py-3 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 " +
                          (active
                            ? "bg-amber-300 text-[#101115]"
                            : "bg-white/[.045] text-slate-200 hover:bg-amber-100/15 hover:text-white")}
                      >
                        {group.prefix}{version}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
