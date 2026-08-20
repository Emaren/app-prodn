"use client";

import {
  Activity,
  Columns3,
  Crosshair,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Rows3,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from "react";

import {
  LivingLeaderboardTable,
} from "@/components/leaderboard/LivingLeaderboardTable";
import {
  LeaderboardScopeToggle,
} from "@/components/leaderboard/LeaderboardScopeToggle";
import {
  LeaderboardViewToggle,
} from "@/components/leaderboard/LeaderboardViewToggle";
import {
  LeaderboardWatcherCard,
} from "@/components/leaderboard/LeaderboardWatcherCard";
import {
  LeaderboardLaneToggle,
} from "@/components/lobby/LeaderboardLaneToggle";
import type {
  LobbyLeaderboardEntry,
} from "@/lib/lobby";
import type {
  LeaderboardLane,
} from "@/lib/leaderboardLane";
import type {
  LeaderboardScope,
} from "@/lib/leaderboardScope";
import type {
  LeaderboardSortDirection,
  LeaderboardSortKey,
} from "@/lib/leaderboardSort";
import {
  DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS,
  LIVING_LEADERBOARD_COLUMNS,
  LIVING_LEADERBOARD_HERO_TITLE_STYLE_COUNT,
  LIVING_LEADERBOARD_WINDOW_ROWS,
  type LivingLeaderboardColumnKey,
  type LivingLeaderboardPreferences,
} from "@/lib/livingLeaderboardPreferences";
import type {
  TileViewMode,
} from "@/lib/tileViewPreferences";

export type LivingLeaderboardSpotlightTarget = {
  key: string;
  rank: number;
  name: string;
  mode: "center";
};

type LivingHeroTitleStyle = {
  name: string;
  className: string;
  style?: CSSProperties;
  auraClass: string;
  ruleClass: string;
};

const LIVING_HERO_TITLE_STYLES:
  readonly LivingHeroTitleStyle[] = [
    {
      name: "Frost Command",
      className:
        "bg-[linear-gradient(96deg,#f8fdff_0%,#dff8ff_22%,#86d9ff_47%,#f4f8ff_72%,#aabfff_100%)] bg-clip-text font-serif font-semibold text-transparent",
      style: {
        textShadow:
          "0 0 24px rgba(56,189,248,0.13)",
      },
      auraClass:
        "bg-cyan-400/[0.055]",
      ruleClass:
        "from-cyan-200/38 via-blue-300/16",
    },

    {
      name: "Spartan Bronze",
      className:
        "bg-[linear-gradient(102deg,#fff0bd_0%,#d9a64d_24%,#8f5425_48%,#f0c96b_70%,#a65d29_100%)] bg-clip-text font-serif font-black text-transparent",
      style: {
        WebkitTextStroke:
          "0.35px rgba(255,224,150,0.18)",
        textShadow:
          "0 2px 0 rgba(36,18,5,0.75), 0 7px 24px rgba(180,96,30,0.28)",
      },
      auraClass:
        "bg-orange-500/[0.075]",
      ruleClass:
        "from-amber-300/50 via-orange-500/20",
    },

    {
      name: "Titanium Legion",
      className:
        "bg-[linear-gradient(180deg,#ffffff_0%,#cfd7e2_32%,#6f7d90_51%,#e8eef6_72%,#8794a8_100%)] bg-clip-text font-sans font-black uppercase text-transparent",
      style: {
        letterSpacing:
          "-0.065em",
        textShadow:
          "0 1px 0 rgba(255,255,255,0.25), 0 5px 24px rgba(148,163,184,0.18)",
      },
      auraClass:
        "bg-slate-300/[0.045]",
      ruleClass:
        "from-slate-200/45 via-slate-500/16",
    },

    {
      name: "Bloodsteel",
      className:
        "bg-[linear-gradient(98deg,#fff6f4_0%,#d6d9df_18%,#991b1b_43%,#ef4444_58%,#9ca3af_82%,#f8fafc_100%)] bg-clip-text font-serif font-black text-transparent",
      style: {
        WebkitTextStroke:
          "0.3px rgba(255,255,255,0.12)",
        textShadow:
          "0 0 18px rgba(185,28,28,0.18), 0 8px 30px rgba(0,0,0,0.28)",
      },
      auraClass:
        "bg-red-600/[0.07]",
      ruleClass:
        "from-red-400/48 via-slate-300/14",
    },

    {
      name: "Imperial Gold",
      className:
        "bg-[linear-gradient(180deg,#fff8cf_0%,#ffe58a_28%,#c7922e_53%,#ffeaa3_73%,#9a6818_100%)] bg-clip-text font-serif font-black text-transparent",
      style: {
        WebkitTextStroke:
          "0.25px rgba(255,247,190,0.24)",
        textShadow:
          "0 1px 0 rgba(255,255,255,0.18), 0 5px 25px rgba(245,158,11,0.24)",
      },
      auraClass:
        "bg-amber-400/[0.065]",
      ruleClass:
        "from-yellow-200/55 via-amber-400/22",
    },

    {
      name: "Arc Reactor",
      className:
        "bg-[linear-gradient(96deg,#effcff_0%,#67e8f9_22%,#22d3ee_43%,#3b82f6_66%,#dbeafe_100%)] bg-clip-text font-sans font-black text-transparent",
      style: {
        letterSpacing:
          "-0.06em",
        textShadow:
          "0 0 10px rgba(34,211,238,0.28), 0 0 34px rgba(59,130,246,0.18)",
      },
      auraClass:
        "bg-cyan-400/[0.09]",
      ruleClass:
        "from-cyan-300/70 via-blue-500/26",
    },

    {
      name: "Obsidian Edge",
      className:
        "bg-[linear-gradient(180deg,#f8fafc_0%,#a8b1bf_27%,#485362_48%,#e2e8f0_68%,#667085_100%)] bg-clip-text font-serif font-black text-transparent",
      style: {
        WebkitTextStroke:
          "0.55px rgba(226,232,240,0.28)",
        textShadow:
          "1px 2px 0 rgba(0,0,0,0.82), 0 7px 24px rgba(0,0,0,0.52)",
      },
      auraClass:
        "bg-slate-500/[0.045]",
      ruleClass:
        "from-white/35 via-slate-500/18",
    },

    {
      name: "Holographic Empire",
      className:
        "bg-[linear-gradient(100deg,#a5f3fc_0%,#60a5fa_24%,#c084fc_47%,#f0abfc_65%,#67e8f9_100%)] bg-clip-text font-sans font-black text-transparent",
      style: {
        letterSpacing:
          "-0.055em",
        textShadow:
          "0 0 20px rgba(168,85,247,0.20), 0 0 36px rgba(34,211,238,0.12)",
      },
      auraClass:
        "bg-violet-500/[0.07]",
      ruleClass:
        "from-cyan-300/48 via-violet-400/32",
    },

    {
      name: "Warforged",
      className:
        "bg-[linear-gradient(101deg,#f5f5f4_0%,#d6a56d_18%,#92400e_39%,#f97316_55%,#9ca3af_78%,#f8fafc_100%)] bg-clip-text font-sans font-black uppercase italic text-transparent",
      style: {
        letterSpacing:
          "-0.067em",
        textShadow:
          "0 2px 0 rgba(50,24,7,0.78), 0 0 25px rgba(234,88,12,0.18)",
      },
      auraClass:
        "bg-orange-600/[0.065]",
      ruleClass:
        "from-orange-300/50 via-stone-400/18",
    },

    {
      name: "Void Crown",
      className:
        "bg-[linear-gradient(96deg,#ffffff_0%,#b8c5da_20%,#64748b_38%,#f8fafc_55%,#d6b35a_73%,#fff3b0_100%)] bg-clip-text font-serif font-black text-transparent",
      style: {
        WebkitTextStroke:
          "0.4px rgba(255,255,255,0.16)",
        textShadow:
          "0 0 12px rgba(148,163,184,0.16), 0 0 30px rgba(250,204,21,0.10), 0 8px 30px rgba(0,0,0,0.46)",
      },
      auraClass:
        "bg-indigo-300/[0.05]",
      ruleClass:
        "from-slate-100/42 via-amber-300/20",
    },

    {
      name: "Cobalt Armor",
      className:
        "bg-clip-text font-sans font-black uppercase text-transparent",
      style: {
        backgroundImage:
          "repeating-linear-gradient(180deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 4px), linear-gradient(180deg, #e3f1ff 0%, #91bff4 13%, #467fc4 29%, #174d92 47%, #082b5c 57%, #2c68ae 71%, #83afe2 86%, #224f88 100%)",
        WebkitTextStroke:
          "0.45px rgba(191,219,254,0.22)",
        textShadow:
          "0 1px 0 rgba(239,246,255,0.20), 0 2px 0 rgba(69,112,166,0.45), 0 4px 0 rgba(5,25,55,0.88), 0 7px 18px rgba(0,0,0,0.42), 0 0 28px rgba(37,99,235,0.18)",
        letterSpacing:
          "-0.065em",
      },
      auraClass:
        "bg-blue-500/[0.085]",
      ruleClass:
        "from-blue-200/42 via-blue-500/17",
    },
    {
    name: "AoE2 Logo Gunmetal",
    className:
      "bg-clip-text font-sans font-black uppercase text-transparent",
    style: {
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.020) 0px, rgba(255,255,255,0.020) 1px, rgba(0,0,0,0.018) 1px, rgba(0,0,0,0.018) 3px), linear-gradient(180deg, #c3beb2 0%, #aaa69c 3%, #7d7d77 8%, #666a69 18%, #505657 34%, #3b4245 49%, #293136 57%, #4b5151 66%, #70726d 70%, #4a5051 76%, #343b3f 87%, #242b2f 100%)",
      WebkitTextStroke:
        "0.42px rgba(191,188,178,0.24)",
      textShadow:
        "0 -1px 0 rgba(225,220,206,0.13), 0 1px 0 rgba(25,29,31,0.96), 0 2px 0 rgba(13,17,20,0.96), 0 4px 0 rgba(7,10,12,0.76), 0 7px 13px rgba(0,0,0,0.40), 0 12px 25px rgba(0,0,0,0.28)",
      letterSpacing:
        "-0.065em",
    },
    auraClass:
      "bg-stone-300/[0.018]",
    ruleClass:
      "from-stone-300/30 via-slate-600/14",
    },
    {
    name: "AoE2 Beveled Steel",
    className:
      "bg-clip-text font-sans font-black uppercase text-transparent",
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, rgba(10,20,28,0.025) 1px, rgba(10,20,28,0.025) 3px), linear-gradient(180deg, #f0f3f4 0%, #e1e5e6 7%, #c5ccd0 18%, #9ca7ae 31%, #74828c 43%, #43525e 50%, #263846 54%, #53636e 62%, #8c989f 72%, #bcc3c7 82%, #7a8790 91%, #465663 100%)",
      backgroundBlendMode:
        "soft-light, normal",
      WebkitTextStroke:
        "0.72px rgba(226,236,241,0.68)",
      textShadow:
        "0 -1px 0 rgba(255,255,255,0.48), 1px 0 0 rgba(193,207,215,0.72), 2px 1px 0 rgba(112,130,142,0.92), 3px 2px 0 rgba(66,84,98,0.96), 4px 3px 0 rgba(38,57,73,0.98), 5px 4px 0 rgba(20,40,57,0.98), 7px 6px 8px rgba(0,0,0,0.58), 0 0 5px rgba(187,226,255,0.50), 0 0 12px rgba(93,190,255,0.34), 0 0 26px rgba(25,125,214,0.20)",
      letterSpacing:
        "-0.067em",
    },
    auraClass:
      "bg-sky-400/[0.045]",
    ruleClass:
      "from-slate-100/48 via-sky-400/17",
  },
  {
    name: "AoE2 Reference Steel",
    className:
      "bg-clip-text font-black uppercase text-transparent",
    style: {
      fontFamily:
        "\"Arial Black\", \"Helvetica Neue\", Arial, sans-serif",
      fontWeight:
        900,
      backgroundImage:
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.022) 0px, rgba(255,255,255,0.022) 1px, rgba(13,30,42,0.025) 1px, rgba(13,30,42,0.025) 4px), linear-gradient(180deg, #eef3f5 0%, #d9e1e4 2%, #bcc8cd 6%, #b3c0c6 14%, #a6b4bb 22%, #92a3ac 32%, #80929d 42%, #6d808b 50%, #586b77 57%, #4e626f 64%, #536773 72%, #4b5e6a 81%, #465966 89%, #71838e 96%, #526673 98%, #354b5a 100%)",
      backgroundBlendMode:
        "soft-light, normal",
      WebkitTextStroke:
        "0.85px rgba(220,232,237,0.82)",
      paintOrder:
        "stroke fill",
      textShadow:
        "0 -1px 0 rgba(255,255,255,0.62), 1px 0 0 rgba(193,207,214,0.82), 1px 1px 0 rgba(127,147,158,0.92), 2px 1px 0 rgba(86,108,122,0.96), 3px 2px 0 rgba(57,80,96,0.98), 4px 3px 0 rgba(38,61,79,0.98), 5px 4px 0 rgba(27,49,68,0.99), 6px 5px 0 rgba(18,38,57,0.99), 8px 7px 9px rgba(0,0,0,0.62), 0 0 3px rgba(220,242,255,0.54), 0 0 8px rgba(119,205,255,0.33), 0 0 18px rgba(56,156,224,0.19)",
      filter:
        "drop-shadow(0 2px 1px rgba(0,0,0,0.44)) drop-shadow(0 8px 10px rgba(0,0,0,0.28))",
      letterSpacing:
        "-0.075em",
    },
    auraClass:
      "bg-sky-300/[0.028]",
    ruleClass:
      "from-slate-100/52 via-sky-300/16",
  },
  {
    name: "AoE2 Beveled Steel II",
    className:
      "bg-clip-text font-sans font-black uppercase text-transparent",
    style: {
      backgroundImage:
        "linear-gradient(180deg, rgba(245,250,252,0.28) 0%, rgba(245,250,252,0.08) 7%, transparent 14%, transparent 45%, rgba(7,21,31,0.18) 47%, rgba(5,18,28,0.62) 50%, rgba(5,17,27,0.78) 52%, rgba(215,229,235,0.30) 53%, rgba(161,181,191,0.16) 58%, transparent 65%), repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, rgba(8,20,29,0.022) 1px, rgba(8,20,29,0.022) 4px), linear-gradient(180deg, #d6dde0 0%, #c5cdd1 4%, #aeb9bf 10%, #98a5ac 19%, #84939b 30%, #6f7f88 40%, #5b6c77 47%, #3d505d 52%, #60717b 57%, #7d8b92 63%, #879399 68%, #697983 76%, #536570 85%, #40535f 93%, #30434f 100%)",
      backgroundBlendMode:
        "screen, soft-light, normal",
      WebkitTextStroke:
        "0.56px rgba(194,211,219,0.54)",
      paintOrder:
        "stroke fill",
      textShadow:
        "0 -1px 0 rgba(237,244,247,0.30), 1px 1px 0 rgba(91,111,123,0.88), 2px 2px 0 rgba(62,83,98,0.95), 3px 3px 0 rgba(42,64,81,0.98), 4px 4px 0 rgba(28,50,68,0.98), 5px 5px 0 rgba(19,39,57,0.98), 7px 7px 8px rgba(0,0,0,0.55), 0 0 3px rgba(188,229,250,0.34), 0 0 8px rgba(77,172,226,0.20), 0 0 16px rgba(29,116,180,0.11)",
      letterSpacing:
        "-0.067em",
    },
    auraClass:
      "bg-sky-400/[0.025]",
    ruleClass:
      "from-slate-200/40 via-sky-500/12",
  },
    {
      name: "Frost Command Darker",
      className:
        "bg-[linear-gradient(96deg,#c1c5c7_0%,#aec1c7_22%,#69a9c7_47%,#bec1c7_72%,#8595c7_100%)] bg-clip-text font-serif font-semibold text-transparent",
      style: {
        textShadow:
          "0 0 24px rgba(56,189,248,0.13)",
      },
      auraClass:
        "bg-cyan-400/[0.055]",
      ruleClass:
        "from-cyan-200/38 via-blue-300/16",
    },
  {
    name: "AoE2 Beveled Steel Dark",
    className:
      "bg-clip-text font-sans font-black uppercase text-transparent",
    style: {
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0.026) 0px, rgba(255,255,255,0.026) 1px, rgba(10,20,28,0.025) 1px, rgba(10,20,28,0.025) 3px), linear-gradient(180deg, #c5c7c8 0%, #b9bcbd 7%, #a2a7ab 18%, #80898f 31%, #5f6b73 43%, #37434d 50%, #1f2e39 54%, #44515a 62%, #737d82 72%, #9aa0a3 82%, #646f76 91%, #394751 100%)",
      backgroundBlendMode:
        "soft-light, normal",
      WebkitTextStroke:
        "0.72px rgba(226,236,241,0.68)",
      textShadow:
        "0 -1px 0 rgba(255,255,255,0.48), 1px 0 0 rgba(193,207,215,0.72), 2px 1px 0 rgba(112,130,142,0.92), 3px 2px 0 rgba(66,84,98,0.96), 4px 3px 0 rgba(38,57,73,0.98), 5px 4px 0 rgba(20,40,57,0.98), 7px 6px 8px rgba(0,0,0,0.58), 0 0 5px rgba(187,226,255,0.50), 0 0 12px rgba(93,190,255,0.34), 0 0 26px rgba(25,125,214,0.20)",
      letterSpacing:
        "-0.067em",
    },
    auraClass:
      "bg-sky-400/[0.045]",
    ruleClass:
      "from-slate-100/48 via-sky-400/17",
  },

  {
    name: "No Title",
    className: "",
    style: {},
    auraClass:
      "bg-transparent",
    ruleClass:
      "from-transparent via-transparent to-transparent",
  },
];

const LIVING_HERO_TITLE_SIZE_CLASSES =
  [
    // 1 Frost Command
    "text-[clamp(3.05rem,4.0vw,5.2rem)]",

    // 2 Spartan Bronze
    "text-[clamp(2.95rem,3.9vw,5.05rem)]",

    // 3 Titanium Legion
    "text-[clamp(2.65rem,3.55vw,4.65rem)]",

    // 4 Bloodsteel
    "text-[clamp(2.95rem,3.85vw,5rem)]",

    // 5 Imperial Gold
    "text-[clamp(2.95rem,3.85vw,5rem)]",

    // 6 Arc Reactor
    "text-[clamp(2.7rem,3.55vw,4.7rem)]",

    // 7 Obsidian Edge
    "text-[clamp(2.95rem,3.85vw,5rem)]",

    // 8 Holographic Empire
    "text-[clamp(2.65rem,3.5vw,4.6rem)]",

    // 9 Warforged
    "text-[clamp(2.55rem,3.35vw,4.4rem)]",

    // 10 Void Crown
    "text-[clamp(2.9rem,3.8vw,4.95rem)]",

    // 11 Cobalt Armor
    "text-[clamp(2.8rem,3.75vw,4.9rem)]",
    // 12 AoE2 Logo Gunmetal
    "text-[clamp(3.05rem,4.0vw,5.2rem)]",
      // 13 AoE2 Beveled Steel
    "text-[clamp(3.05rem,4.05vw,5.25rem)]",
    // 14 AoE2 Reference Steel
    "text-[clamp(3.0rem,3.98vw,5.15rem)]",
    // 15 AoE2 Beveled Steel II
    "text-[clamp(3.05rem,4.05vw,5.25rem)]",
    // 16 Frost Command Darker
    "text-[clamp(3.05rem,4.0vw,5.2rem)]",
    // 17 AoE2 Beveled Steel Dark
    "text-[clamp(3.05rem,4.05vw,5.25rem)]",

    // 18 No Title
    "",
] as const;

const LIVING_HERO_TITLE_TOGGLE_STYLES =
  [
    16, // AoE2 Beveled Steel Dark
    12, // AoE2 Beveled Steel
    1,  // Spartan Bronze
    2,  // Titanium Legion
    10, // Cobalt Armor
    11, // AoE2 Logo Gunmetal
    17, // No Title
  ] as const;

const LIVING_HERO_TITLE_HIDDEN_STYLE =
  17;


const LIVING_COLUMN_LABELS:
  Record<
    LivingLeaderboardColumnKey,
    string
  > = {
    rating: "Rating",
    movement24h: "24h",
    last10: "Last 10",
    last30: "30d",
    winRate: "Win %",
    record: "W–L",
    games: "Games",
    streak: "Streak",
    lastPlayed: "Last played",
  };

function pulseWarrior(
  entry: LobbyLeaderboardEntry,
) {
  const streak = String(
    entry.streakLabel ?? "",
  )
    .trim()
    .toUpperCase();

  const streakMatch =
    streak.match(/^W(\d+)$/);

  const winStreak =
    streakMatch
      ? Number.parseInt(
          streakMatch[1],
          10,
        )
      : 0;

  return (
    entry.rankDelta24hState ===
      "new" ||
    entry.rankDelta24hState ===
      "up" ||
    winStreak >= 2
  );
}

function CommandButton({
  active,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/45 disabled:cursor-not-allowed disabled:opacity-25 ${
        active
          ? "border-amber-200/28 bg-amber-300/[0.10] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(251,191,36,0.08)]"
          : "border-transparent bg-transparent text-slate-500 hover:border-white/[0.08] hover:bg-white/[0.045] hover:text-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function RowDetailModeGlyph({
  mode,
}: {
  mode:
    | 1
    | 2
    | 3;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[1.15rem] w-[1.15rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Inline — an attached detail row opens in-place. */}
      <g
        className={`transition-opacity duration-150 ${
          mode === 1
            ? "opacity-100"
            : "opacity-0"
        }`}
      >
        <path d="M4 5.5h16" />
        <path d="M4 10h16" />
        <path d="M4 14.5h16" />

        <rect
          x="7"
          y="17.5"
          width="13"
          height="3"
          rx="1"
        />

        <path d="M4 19h1" />
      </g>

      {/* Docked — ranked field above, inspector shelf below. */}
      <g
        className={`transition-opacity duration-150 ${
          mode === 2
            ? "opacity-100"
            : "opacity-0"
        }`}
      >
        <path d="M4 4.5h16" />
        <path d="M4 8.5h16" />
        <path d="M4 12.5h16" />

        <rect
          x="3.5"
          y="16.5"
          width="17"
          height="4"
          rx="1.25"
        />
      </g>

      {/* Modal — ranked field stays fixed under floating detail. */}
      <g
        className={`transition-opacity duration-150 ${
          mode === 3
            ? "opacity-100"
            : "opacity-0"
        }`}
      >
        <path
          d="M4 5h16"
          opacity="0.42"
        />

        <path
          d="M4 10h16"
          opacity="0.42"
        />

        <path
          d="M4 15h16"
          opacity="0.42"
        />

        <rect
          x="6.25"
          y="7.25"
          width="11.5"
          height="9.5"
          rx="2"
          className="fill-[#07111f]"
        />

        <path d="M9 10.5h6" />
        <path d="M9 13.5h4" />
      </g>
    </svg>
  );
}

function podiumMetal(
  rank: number,
) {
  if (rank === 1) {
    return "border-amber-200/42 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.25),transparent_62%),linear-gradient(145deg,rgba(92,61,14,0.38),rgba(4,9,17,0.88))] shadow-[inset_0_1px_0_rgba(255,243,190,0.10),0_10px_34px_rgba(245,158,11,0.09),0_0_28px_rgba(251,191,36,0.07)]";
  }

  if (rank === 2) {
    return "border-slate-200/24 bg-[radial-gradient(circle_at_50%_0%,rgba(226,232,240,0.13),transparent_60%),linear-gradient(145deg,rgba(51,65,85,0.28),rgba(4,9,17,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
  }

  return "border-orange-300/24 bg-[radial-gradient(circle_at_50%_0%,rgba(194,120,71,0.15),transparent_60%),linear-gradient(145deg,rgba(82,40,18,0.30),rgba(4,9,17,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
}

function PodiumCard({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  return (
    <Link
      href={entry.href}
      title={`Open #${entry.rank} ${entry.currentName}`}
      className={`group min-w-0 rounded-[1.05rem] border px-4 py-3.5 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:shadow-[0_16px_38px_rgba(0,0,0,0.26)] ${podiumMetal(
        entry.rank,
      )}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
          #{entry.rank}
        </span>

        {entry.rank === 1 ? (
          <Crown
            className="h-3.5 w-3.5 text-amber-300"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="mt-2.5 truncate text-[0.94rem] font-black tracking-[-0.015em] text-slate-100 transition group-hover:text-white">
        {entry.currentName}
      </div>

      <div className="mt-1 text-xs font-bold tabular-nums text-amber-100/80">
        {entry.primaryRatingLabel}
      </div>
    </Link>
  );
}

export function LivingLeaderboard({
  viewMode,
  onViewModeChange,
  lane,
  onLaneChange,
  scope,
  onScopeChange,
  searchInput,
  onSearchInputChange,
  query,
  trackedPlayers,
  activePlayers,
  entries,
  podiumEntries,
  sortKey,
  sortDirection,
  onSort,
  loading,
  loadingMore,
  error,
  hasMore,
  hasEarlier,
  onRetry,
  onLoadMore,
  onLoadEarlier,
  preferences,
  onPreferencesChange,
  spotlightTarget,
  spotlightLoading,
  spotlightAvailable,
  personalRankViewActive,
}: {
  viewMode: TileViewMode;
  onViewModeChange: (
    mode: TileViewMode,
  ) => void;
  lane: LeaderboardLane;
  onLaneChange: (
    lane: LeaderboardLane,
  ) => void;
  scope: LeaderboardScope;
  onScopeChange: (
    scope: LeaderboardScope,
  ) => void;
  searchInput: string;
  onSearchInputChange: (
    value: string,
  ) => void;
  query: string;
  trackedPlayers: number;
  activePlayers: number;
  entries: LobbyLeaderboardEntry[];
  podiumEntries: LobbyLeaderboardEntry[];
  sortKey: LeaderboardSortKey | null;
  sortDirection:
    | LeaderboardSortDirection
    | null;
  onSort: (
    key: LeaderboardSortKey,
  ) => void;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  hasEarlier: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
  onLoadEarlier: () => void;
  preferences: LivingLeaderboardPreferences;
  onPreferencesChange: (
    patch: Partial<LivingLeaderboardPreferences>,
  ) => void;
  spotlightTarget:
    | LivingLeaderboardSpotlightTarget
    | null;
  spotlightLoading: boolean;
  spotlightAvailable: boolean;
  personalRankViewActive: boolean;
}) {
  const viewportRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const commandSnapRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const tableSnapRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const rowScrollRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const focusStageRef =
    useRef<
      "overview" | "command" | "table"
    >("overview");

  const appHeaderRef =
    useRef<HTMLElement | null>(
      null,
    );

  const mobileNavRef =
    useRef<HTMLElement | null>(
      null,
    );

  const returnRailRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    appHeaderHeight,
    setAppHeaderHeight,
  ] = useState(0);

  const spotlightExitDestinationRef =
    useRef<
      "overview" | "table"
    >("table");

  useLayoutEffect(() => {
    const header =
      document.querySelector<HTMLElement>(
        "[data-app-shell-header]",
      );

    if (!header) {
      return;
    }

    const mobileNav =
      document.querySelector<HTMLElement>(
        "[data-mobile-floating-nav]",
      );

    appHeaderRef.current =
      header;
    mobileNavRef.current =
      mobileNav;

    const previousHeaderTransition =
      header.style.transition;
    const previousHeaderTransform =
      header.style.transform;
    const previousHeaderOpacity =
      header.style.opacity;
    const previousHeaderPointerEvents =
      header.style.pointerEvents;
    const previousHeaderWillChange =
      header.style.willChange;
    const previousHeaderBackfaceVisibility =
      header.style.backfaceVisibility;
    const previousMobileDisplay =
      mobileNav?.style.display ?? "";

    header.style.transition =
      "none";
    header.style.willChange =
      "transform";
    header.style.backfaceVisibility =
      "hidden";

    const measure = () => {
      const nextHeight =
        Math.ceil(
          header.getBoundingClientRect()
            .height,
        );

      setAppHeaderHeight((current) =>
        current === nextHeight
          ? current
          : nextHeight,
      );
    };

    measure();

    const observer =
      new ResizeObserver(measure);

    observer.observe(header);
    window.addEventListener(
      "resize",
      measure,
    );

    return () => {
      observer.disconnect();
      window.removeEventListener(
        "resize",
        measure,
      );

      header.style.transition =
        previousHeaderTransition;
      header.style.transform =
        previousHeaderTransform;
      header.style.opacity =
        previousHeaderOpacity;
      header.style.pointerEvents =
        previousHeaderPointerEvents;
      header.style.willChange =
        previousHeaderWillChange;
      header.style.backfaceVisibility =
        previousHeaderBackfaceVisibility;

      if (mobileNav) {
        mobileNav.style.display =
          previousMobileDisplay;
      }

      appHeaderRef.current =
        null;
      mobileNavRef.current =
        null;
    };
  }, []);

  const prependAnchorRef =
    useRef<{
      scrollHeight: number;
      scrollTop: number;
    } | null>(null);

  const [
    rankWindowOpen,
    setRankWindowOpen,
  ] =
    useState(false);

  const [
    hiddenOpen,
    setHiddenOpen,
  ] =
    useState(false);

  const [
    columnsOpen,
    setColumnsOpen,
  ] =
    useState(false);


  useEffect(() => {
    if (
      !rankWindowOpen &&
      !hiddenOpen &&
      !columnsOpen
    ) {
      return;
    }

    const closeCommandPopovers = () => {
      setRankWindowOpen(false);
      setHiddenOpen(false);
      setColumnsOpen(false);
    };

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      const target =
        event.target;

      if (
        target instanceof Element &&
        target.closest(
          "[data-living-command-popover]",
        )
      ) {
        return;
      }

      closeCommandPopovers();
    };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
        "Escape"
      ) {
        closeCommandPopovers();
      }
    };

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [
    rankWindowOpen,
    hiddenOpen,
    columnsOpen,
  ]);

  const [
    rankStartDraft,
    setRankStartDraft,
  ] =
    useState(
      String(
        preferences.rankWindowStart ??
          1,
      ),
    );

  useEffect(() => {
    setRankStartDraft(
      String(
        preferences.rankWindowStart ??
          1,
      ),
    );
  }, [
    preferences.rankWindowStart,
  ]);

  const bookmarks =
    useMemo(
      () =>
        new Set(
          preferences.bookmarkedPlayerKeys,
        ),
      [
        preferences.bookmarkedPlayerKeys,
      ],
    );

  const hiddenKeys =
    useMemo(
      () =>
        new Set(
          preferences.hiddenPlayers.map(
            (entry) =>
              entry.key,
          ),
        ),
      [
        preferences.hiddenPlayers,
      ],
    );

  const unhiddenEntries =
    useMemo(
      () =>
        entries.filter(
          (entry) =>
            !hiddenKeys.has(
              entry.key,
            ) ||
            entry.key ===
              spotlightTarget?.key,
        ),
      [
        entries,
        hiddenKeys,
        spotlightTarget?.key,
      ],
    );

  const visibleEntries =
    useMemo(
      () =>
        preferences.bookmarkedOnly
          ? unhiddenEntries.filter(
              (entry) =>
                bookmarks.has(
                  entry.key,
                ),
            )
          : unhiddenEntries,
      [
        bookmarks,
        preferences.bookmarkedOnly,
        unhiddenEntries,
      ],
    );

  const requestedHeroTitleStyleIndex =
    Math.max(
      0,
      Math.min(
        LIVING_LEADERBOARD_HERO_TITLE_STYLE_COUNT -
          1,
        preferences.heroTitleStyle,
      ),
    );

  const heroTitleStyleIndex =
    LIVING_HERO_TITLE_TOGGLE_STYLES.includes(
      requestedHeroTitleStyleIndex as
        (typeof LIVING_HERO_TITLE_TOGGLE_STYLES)[number],
    )
      ? requestedHeroTitleStyleIndex
      : 10;

  const heroTitleStyle =
    LIVING_HERO_TITLE_STYLES[
      heroTitleStyleIndex
    ];

  const heroTitleSizeClass =
    LIVING_HERO_TITLE_SIZE_CLASSES[
      heroTitleStyleIndex
    ];

  const heroTitleTogglePosition =
    LIVING_HERO_TITLE_TOGGLE_STYLES.indexOf(
      heroTitleStyleIndex as
        (typeof LIVING_HERO_TITLE_TOGGLE_STYLES)[number],
    );

  const heroTitleHidden =
    heroTitleStyleIndex ===
    LIVING_HERO_TITLE_HIDDEN_STYLE;

  const cycleHeroTitleStyle = () => {
    const nextPosition =
      (
        heroTitleTogglePosition +
        1
      ) %
      LIVING_HERO_TITLE_TOGGLE_STYLES.length;

    onPreferencesChange({
      heroTitleStyle:
        LIVING_HERO_TITLE_TOGGLE_STYLES[
          nextPosition
        ],
    });
  };

  const loadedMovers =
    entries.filter(
      (entry) =>
        pulseWarrior(entry),
    ).length;

  const onlinePlayers =
    Math.max(
      0,
      Math.floor(
        activePlayers,
      ),
    );

  const toggleBookmark = (
    entry: LobbyLeaderboardEntry,
  ) => {
    const next =
      new Set(
        preferences.bookmarkedPlayerKeys,
      );

    if (next.has(entry.key)) {
      next.delete(entry.key);
    } else {
      next.add(entry.key);
    }

    onPreferencesChange({
      bookmarkedPlayerKeys:
        Array.from(next),
    });
  };

  const hideEntry = (
    entry: LobbyLeaderboardEntry,
  ) => {
    if (
      hiddenKeys.has(entry.key)
    ) {
      return;
    }

    onPreferencesChange({
      hiddenPlayers: [
        ...preferences.hiddenPlayers,
        {
          key: entry.key,
          name:
            entry.currentName,
        },
      ],
    });
  };

  const unhideEntry = (
    key: string,
  ) => {
    onPreferencesChange({
      hiddenPlayers:
        preferences.hiddenPlayers.filter(
          (entry) =>
            entry.key !== key,
        ),
    });
  };

  const toggleColumn = (
    column:
      LivingLeaderboardColumnKey,
  ) => {
    const next =
      new Set(
        preferences.columnMode ===
        "custom"
          ? preferences.visibleColumns
          : DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS,
      );

    if (next.has(column)) {
      next.delete(column);
    } else {
      next.add(column);
    }

    onPreferencesChange({
      columnMode: "custom",
      visibleColumns:
        LIVING_LEADERBOARD_COLUMNS.filter(
          (candidate) =>
            next.has(candidate),
        ),
    });
  };

  const closeCommandPopovers = () => {
    setRankWindowOpen(false);
    setHiddenOpen(false);
    setColumnsOpen(false);
  };

  const setReturnRailVisible =
    useCallback(
      (
        visible: boolean,
      ) => {
        const rail =
          returnRailRef.current;

        if (!rail) {
          return;
        }

        rail.style.opacity =
          visible ? "1" : "0";
        rail.style.transform =
          visible
            ? "translate3d(0, 0, 0)"
            : "translate3d(0, 0.5rem, 0)";
        rail.style.pointerEvents =
          visible ? "auto" : "none";
      },
      [],
    );

  const syncAppChromeToScroll =
    useCallback(
      (
        scrollTop: number,
      ) => {
        const header =
          appHeaderRef.current;

        if (!header) {
          return;
        }

        const travel =
          Math.max(
            1,
            appHeaderHeight ||
              Math.ceil(
                header.getBoundingClientRect()
                  .height,
              ),
          );

        const offset =
          Math.min(
            travel,
            Math.max(
              0,
              scrollTop,
            ),
          );

        const transform =
          `translate3d(0, -${offset}px, 0)`;

        if (
          header.style.transform !==
          transform
        ) {
          header.style.transform =
            transform;
        }
      },
      [
        appHeaderHeight,
      ],
    );

  const setFocusStageImperatively =
    useCallback(
      (
        stage:
          | "overview"
          | "command"
          | "table",
      ) => {
        focusStageRef.current =
          stage;

        const viewport =
          viewportRef.current;

        if (viewport) {
          viewport.dataset.leaderboardFocus =
            stage;
        }

        const mobileNav =
          mobileNavRef.current;

        if (mobileNav) {
          mobileNav.style.display =
            stage === "table"
              ? "none"
              : "";
        }

        setReturnRailVisible(
          stage !== "overview" ||
            personalRankViewActive,
        );
      },
      [
        personalRankViewActive,
        setReturnRailVisible,
      ],
    );

  useLayoutEffect(() => {
    const rail =
      returnRailRef.current;

    if (!rail) {
      return;
    }

    const visible =
      personalRankViewActive ||
      focusStageRef.current !==
        "overview";

    rail.style.opacity =
      visible ? "1" : "0";
    rail.style.transform =
      visible
        ? "translate3d(0, 0, 0)"
        : "translate3d(0, 0.5rem, 0)";
    rail.style.pointerEvents =
      visible ? "auto" : "none";
  }, [
    personalRankViewActive,
  ]);

  const scrollToCommand = () => {
    const viewport =
      viewportRef.current;

    const commandTop =
      commandSnapRef.current
        ?.offsetTop ?? 0;

    closeCommandPopovers();

    viewport?.scrollTo({
      top: commandTop,
      behavior: "smooth",
    });
  };

  const returnToBoardTop = () => {
    spotlightExitDestinationRef.current =
      "overview";

    const hasPersonalNavigation =
      preferences.spotlightMode !==
        "off" ||
      preferences.rankWindowStart !==
        null ||
      personalRankViewActive;

    if (hasPersonalNavigation) {
      onPreferencesChange({
        spotlightMode: "off",
        rankWindowStart: null,
      });
    }

    closeCommandPopovers();

    window.requestAnimationFrame(
      () => {
        rowScrollRef.current?.scrollTo({
          top: 0,
          behavior: "auto",
        });

        setFocusStageImperatively(
          "overview",
        );

        syncAppChromeToScroll(
          0,
        );

        viewportRef.current?.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      },
    );
  };

  const cycleSpotlight = () => {
    if (
      preferences.spotlightMode ===
      "off"
    ) {
      onPreferencesChange({
        spotlightMode: "center",
        rankWindowStart: null,
      });

      closeCommandPopovers();
      return;
    }

    returnToBoardTop();
  };

  const applyRankWindow = () => {
    const parsed =
      Number.parseInt(
        rankStartDraft,
        10,
      );

    const start =
      Number.isFinite(parsed)
        ? Math.max(
            1,
            Math.min(
              Math.max(
                1,
                trackedPlayers,
              ),
              parsed,
            ),
          )
        : 1;

    onPreferencesChange({
      spotlightMode: "off",
      rankWindowStart:
        start,
    });

    setRankWindowOpen(false);
  };

  const clearRankWindow = () => {
    onPreferencesChange({
      rankWindowStart:
        null,
    });

    setRankWindowOpen(false);
  };

  useEffect(() => {
    const viewport =
      viewportRef.current;

    const rowsViewport =
      rowScrollRef.current;

    if (
      !spotlightTarget ||
      !viewport ||
      !rowsViewport
    ) {
      return;
    }

    const candidates =
      Array.from(
        rowsViewport.querySelectorAll<HTMLElement>(
          '[data-living-spotlight="true"]',
        ),
      );

    const target =
      candidates.find(
        (candidate) =>
          candidate.offsetParent !==
          null,
      );

    if (!target) {
      return;
    }

    const rowsRect =
      rowsViewport.getBoundingClientRect();

    const targetRect =
      target.getBoundingClientRect();

    const targetTop =
      rowsViewport.scrollTop +
      targetRect.top -
      rowsRect.top;

    const desiredTop =
      targetTop -
      (
        rowsViewport.clientHeight -
        targetRect.height
      ) /
        2;

    viewport.scrollTo({
      top:
        tableSnapRef.current
          ?.offsetTop ?? 0,
      behavior: "smooth",
    });

    rowsViewport.scrollTo({
      top: Math.max(
        0,
        desiredTop,
      ),
      behavior: "smooth",
    });
  }, [
    spotlightTarget,
  ]);

  useLayoutEffect(() => {
    const anchor =
      prependAnchorRef.current;

    const rowsViewport =
      rowScrollRef.current;

    if (
      !anchor ||
      !rowsViewport
    ) {
      return;
    }

    const addedHeight =
      rowsViewport.scrollHeight -
      anchor.scrollHeight;

    if (addedHeight > 0) {
      rowsViewport.scrollTop =
        anchor.scrollTop +
        addedHeight;
    }

    prependAnchorRef.current =
      null;
  }, [entries]);

  const previousSpotlightTargetRef =
    useRef(
      spotlightTarget,
    );

  useLayoutEffect(() => {
    const previous =
      previousSpotlightTargetRef.current;

    const viewport =
      viewportRef.current;

    // Spotlight -> off:
    // canonical rows have already been restored in memory.
    // Explicit Spotlight/Top exits return to full overview;
    // other controller-owned exits preserve the table focus.
    if (
      previous &&
      !spotlightTarget &&
      viewport
    ) {
      const destination =
        spotlightExitDestinationRef.current;

      viewport.scrollTop =
        destination === "overview"
          ? 0
          : tableSnapRef.current
              ?.offsetTop ?? 0;

      setFocusStageImperatively(
        destination === "overview"
          ? "overview"
          : "table",
      );

      rowScrollRef.current?.scrollTo({
        top: 0,
        behavior: "auto",
      });

      syncAppChromeToScroll(
        viewport.scrollTop,
      );

      spotlightExitDestinationRef.current =
        "table";
    }

    previousSpotlightTargetRef.current =
      spotlightTarget;
  }, [
    spotlightTarget,
    setFocusStageImperatively,
    syncAppChromeToScroll,
  ]);

  const handleViewportScroll = (
    event: UIEvent<HTMLDivElement>,
  ) => {
    const node =
      event.currentTarget;

    syncAppChromeToScroll(
      node.scrollTop,
    );

    const commandTop =
      commandSnapRef.current
        ?.offsetTop ??
      Number.POSITIVE_INFINITY;

    const tableTop =
      tableSnapRef.current
        ?.offsetTop ??
      Number.POSITIVE_INFINITY;

    const commandThreshold =
      Number.isFinite(commandTop)
        ? commandTop / 2
        : Number.POSITIVE_INFINITY;

    const tableThreshold =
      Number.isFinite(tableTop) &&
      Number.isFinite(commandTop)
        ? commandTop +
          (tableTop - commandTop) / 2
        : Number.POSITIVE_INFINITY;

    const nextFocusStage =
      node.scrollTop >=
      tableThreshold
        ? "table"
        : node.scrollTop >=
            commandThreshold
          ? "command"
          : "overview";

    if (
      focusStageRef.current !==
      nextFocusStage
    ) {
      setFocusStageImperatively(
        nextFocusStage,
      );
    }

  };

  useEffect(() => {
    const rowsViewport =
      rowScrollRef.current;

    if (!rowsViewport) {
      return;
    }

    const handleColumnHeaderWheel = (
      event: globalThis.WheelEvent,
    ) => {
      const target =
        event.target;

      if (
        !(target instanceof Element) ||
        !target.closest(
          "[data-leaderboard-column-header]",
        )
      ) {
        return;
      }

      const viewport =
        viewportRef.current;

      if (
        !viewport ||
        Math.abs(event.deltaY) < 1
      ) {
        return;
      }

      // The sticky column header is chrome, not warrior data.
      // Wheel over it pulls the whole Leaderboard between its
      // overview / command / maximum-table focus positions.
      event.preventDefault();
      event.stopPropagation();

      viewport.scrollBy({
        top: event.deltaY,
        behavior: "auto",
      });
    };

    rowsViewport.addEventListener(
      "wheel",
      handleColumnHeaderWheel,
      {
        capture: true,
        passive: false,
      },
    );

    return () => {
      rowsViewport.removeEventListener(
        "wheel",
        handleColumnHeaderWheel,
        true,
      );
    };
  }, []);

  const handleRowsScroll = (
    event: UIEvent<HTMLDivElement>,
  ) => {
    const node =
      event.currentTarget;

    if (
      loading ||
      loadingMore
    ) {
      return;
    }

    const spotlightActive =
      Boolean(
        spotlightTarget,
      );

    // Spotlight starts as a centered 50/50 context window.
    // The inner row plane then expands lazily before either
    // loaded boundary while preserving the visible warrior.
    if (
      spotlightActive &&
      hasEarlier &&
      node.scrollTop <= 1800
    ) {
      if (
        !prependAnchorRef.current
      ) {
        prependAnchorRef.current = {
          scrollHeight:
            node.scrollHeight,
          scrollTop:
            node.scrollTop,
        };
      }

      onLoadEarlier();
      return;
    }

    if (
      spotlightActive &&
      hasMore &&
      node.scrollTop +
        node.clientHeight >=
      node.scrollHeight -
        1800
    ) {
      onLoadMore();
      return;
    }

    // Explicit rank windows stay deliberately bounded.
    if (personalRankViewActive) {
      return;
    }

    if (
      hasMore &&
      node.scrollTop +
        node.clientHeight >=
      node.scrollHeight -
        1800
    ) {
      onLoadMore();
    }
  };

  const rankWindowEnd =
    preferences.rankWindowStart
      ? Math.min(
          trackedPlayers,
          preferences.rankWindowStart +
            preferences.rankWindowRows -
            1,
        )
      : null;

  const countLabel =
    spotlightTarget
      ? `#${spotlightTarget.rank}`
      : preferences.rankWindowStart &&
          rankWindowEnd
        ? `${preferences.rankWindowStart}–${rankWindowEnd}`
        : preferences.bookmarkedOnly
          ? String(
              visibleEntries.length,
            )
          : trackedPlayers.toLocaleString();

  const countSublabel =
    spotlightTarget
      ? "spotlight"
      : preferences.rankWindowStart
        ? "window"
        : preferences.bookmarkedOnly
          ? "saved"
          : query
            ? "matching"
            : scope === "claimed"
              ? "kingdom"
              : "warriors";

  return (
    <section
      ref={viewportRef}
      data-living-leaderboard-viewport
      data-leaderboard-focus={
        focusStageRef.current
      }
      onScroll={handleViewportScroll}
      className="relative flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain scroll-smooth rounded-[2rem] border border-amber-200/22 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.11),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.08),transparent_28%),linear-gradient(145deg,#0b1728,#050b15_56%,#02060d)] shadow-[0_40px_130px_rgba(0,0,0,0.48),0_0_0_1px_rgba(201,155,60,0.045)] [scroll-snap-type:y_proximity] [scrollbar-gutter:stable]"
    >
      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/50 to-transparent" />

      <div
        ref={returnRailRef}
        data-leaderboard-return-rail
        style={{
          opacity:
            personalRankViewActive ||
            focusStageRef.current !==
              "overview"
              ? 1
              : 0,
          transform:
            personalRankViewActive ||
            focusStageRef.current !==
              "overview"
              ? "translate3d(0, 0, 0)"
              : "translate3d(0, 0.5rem, 0)",
          pointerEvents:
            personalRankViewActive ||
            focusStageRef.current !==
              "overview"
              ? "auto"
              : "none",
        }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-[175] transition-[opacity,transform] duration-150 lg:bottom-5 lg:right-5"
      >
          <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-amber-100/16 bg-[#030914]/92 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl">
            <button
              type="button"
              onClick={scrollToCommand}
              aria-label="Show leaderboard commands"
              title="Commands"
              className="group inline-flex h-10 items-center gap-2 rounded-xl border border-transparent px-3 text-slate-400 transition-[border-color,background-color,color,transform] duration-150 hover:-translate-y-px hover:border-cyan-200/16 hover:bg-cyan-300/[0.055] hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/35"
            >
              <Search
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] sm:inline">
                Commands
              </span>
            </button>

            <div className="h-6 w-px bg-white/[0.08]" />

            <button
              type="button"
              onClick={returnToBoardTop}
              aria-label="Return to leaderboard top"
              title="Top"
              className="group inline-flex h-10 items-center gap-2 rounded-xl border border-transparent px-3 text-amber-100/80 transition-[border-color,background-color,color,transform] duration-150 hover:-translate-y-px hover:border-amber-200/22 hover:bg-amber-300/[0.07] hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40"
            >
              <Crown
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span className="hidden text-[9px] font-black uppercase tracking-[0.16em] sm:inline">
                Top
              </span>
            </button>
          </div>
      </div>

      <div
        data-leaderboard-snap="overview"
        aria-hidden="true"
        style={{
          height:
            appHeaderHeight > 0
              ? `${appHeaderHeight}px`
              : "4.0625rem",
        }}
        className="shrink-0 [scroll-snap-align:start] [scroll-snap-stop:always]"
      />

      <header
        className="relative shrink-0 grid gap-7 border-b border-white/[0.07] px-6 py-6 sm:px-9 sm:py-7 lg:grid-cols-[minmax(31rem,0.92fr)_minmax(37rem,1.08fr)] lg:items-center lg:gap-10 lg:px-12 lg:py-7 2xl:grid-cols-[minmax(36rem,0.88fr)_minmax(43rem,1.12fr)] 2xl:gap-14"
      >
        <div
          className={`relative min-w-0 ${
            heroTitleHidden
              ? "cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/30"
              : ""
          }`}
          onClick={
            heroTitleHidden
              ? cycleHeroTitleStyle
              : undefined
          }
          onKeyDown={
            heroTitleHidden
              ? (event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    cycleHeroTitleStyle();
                  }
                }
              : undefined
          }
          role={
            heroTitleHidden
              ? "button"
              : undefined
          }
          tabIndex={
            heroTitleHidden
              ? 0
              : undefined
          }
          aria-label={
            heroTitleHidden
              ? "Restore HD Leaderboard title"
              : undefined
          }
          title={
            heroTitleHidden
              ? "Restore HD Leaderboard title"
              : undefined
          }
        >
          <div
            className={`pointer-events-none absolute -left-16 top-6 h-32 w-96 rounded-full blur-[70px] transition-colors duration-200 ${heroTitleStyle.auraClass}`}
          />

          <div className="relative flex items-center gap-3">
            <span className="h-px w-8 bg-gradient-to-r from-cyan-300/80 to-cyan-300/10" />

            <div className="text-[9px] font-black uppercase tracking-[0.42em] text-cyan-100/55">
              AoE2WAR · Living Ranked Command
            </div>
          </div>

          {!heroTitleHidden ? (
<div className="relative mt-3 overflow-visible pr-5">
            <h1 className="relative">
              <button
                type="button"
                onClick={
                  cycleHeroTitleStyle
                }
                aria-label={`Change leaderboard title style. Current ${heroTitleStyle.name}, ${heroTitleTogglePosition + 1} of ${LIVING_HERO_TITLE_TOGGLE_STYLES.length}.`}
                title={`${heroTitleStyle.name} · ${heroTitleTogglePosition + 1}/${LIVING_HERO_TITLE_TOGGLE_STYLES.length} · click for next style`}
                className="group/title relative inline-block max-w-full cursor-pointer select-none overflow-visible rounded-lg text-left outline-none transition-[filter] duration-150 hover:brightness-125 focus-visible:ring-2 focus-visible:ring-cyan-200/35"
              >
                <span
                  className={`${heroTitleSizeClass} block whitespace-nowrap overflow-visible px-[0.06em] pb-[0.08em] pr-[0.20em] leading-[0.91] tracking-[-0.058em] transition-[filter,opacity] duration-150 ${heroTitleStyle.className}`}
                  style={
                    heroTitleStyle.style
                  }
                >
                  HD Leaderboard
                </span>

                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1 -top-3 rounded-full border border-white/[0.08] bg-black/55 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-slate-400 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md transition-opacity duration-150 group-hover/title:opacity-100"
                >
                  {heroTitleStyle.name}
                  {" · "}
                  {heroTitleStyleIndex +
                    1}
                  /
                  {
                    LIVING_HERO_TITLE_TOGGLE_STYLES.length
                  }
                </span>
              </button>
            </h1>

            <div
              className={`mt-3 h-px max-w-[31rem] bg-gradient-to-r to-transparent transition-colors duration-200 ${heroTitleStyle.ruleClass}`}
            />
          </div>
          ) : null}

          <div className={`relative flex flex-wrap items-center gap-2 ${heroTitleHidden ? "mt-3" : "mt-5"}`}>
            <span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
              {lane.toUpperCase()}
            </span>

            <span className="rounded-full border border-white/[0.09] bg-white/[0.025] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-200/80">
              {scope === "claimed"
                ? "Kingdom"
                : "Warriors"}
            </span>

            <span className="rounded-full border border-white/[0.055] bg-black/15 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
              {entries.length} loaded
            </span>

            {loadedMovers > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/12 bg-orange-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-200/80"
                title="Loaded rank pulse"
              >
                <Flame
                  className="h-3 w-3"
                  aria-hidden="true"
                />
                {loadedMovers}
              </span>
            ) : null}

            {onlinePlayers > 0 ? (
              <span
                className="rounded-full border border-emerald-300/12 bg-emerald-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300/80"
                title="Realtime claimed warriors currently online"
              >
                {onlinePlayers} online
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 self-start lg:-mt-1">
          <div className="flex min-h-0 flex-col justify-center">
            <div className="mb-2.5 flex items-center justify-end pr-0.5">
              <LeaderboardViewToggle
                value={viewMode}
                onChange={
                  onViewModeChange
                }
                compact
              />
            </div>

            {podiumEntries.length > 0 ? (
              <div className="ml-auto grid w-full max-w-[47rem] grid-cols-3 gap-3">
                {podiumEntries.map(
                  (entry) => (
                    <PodiumCard
                      key={entry.key}
                      entry={entry}
                    />
                  ),
                )}
              </div>
            ) : null}


            <div className="ml-auto mt-3 flex w-full max-w-[47rem] justify-end border-t border-cyan-100/[0.07] pt-2.5">
              <div className="min-w-0 max-w-full">
                <LeaderboardWatcherCard
                  bare
                />
              </div>
            </div>

          </div>
        </div>
      </header>

      <div
        ref={commandSnapRef}
        data-leaderboard-snap="command"
        className="relative shrink-0 grid gap-3 border-b border-white/[0.07] bg-black/20 px-5 py-3 sm:px-8 lg:grid-cols-[auto_auto_minmax(24rem,1fr)_auto_auto] lg:items-center lg:px-10 [scroll-snap-align:start] [scroll-snap-stop:always]"
      >
        <LeaderboardLaneToggle
          lane={lane}
          onChange={onLaneChange}
          loading={loading}
          variant="compact"
        />

        <LeaderboardScopeToggle
          value={scope}
          onChange={onScopeChange}
        />

        <label className="relative block min-w-0 lg:mx-auto lg:w-full lg:max-w-3xl">
          <span className="sr-only">
            Search warriors
          </span>

          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-amber-200/65"
            aria-hidden="true"
          />

          <input
            type="search"
            value={searchInput}
            onChange={(event) =>
              onSearchInputChange(
                event.target.value,
              )
            }
            placeholder="Search warrior"
            style={{
              backgroundColor:
                "#020711",
              color:
                "#f8fafc",
              WebkitTextFillColor:
                "#f8fafc",
              colorScheme:
                "dark",
              caretColor:
                "#fde68a",
            }}
            className="h-11 w-full appearance-none rounded-xl border border-cyan-200/12 bg-[#020711] pl-11 pr-11 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_8px_28px_rgba(0,0,0,0.18)] outline-none transition-[border-color,box-shadow] placeholder:text-slate-600 hover:border-cyan-200/24 focus:border-amber-200/48 focus:ring-2 focus:ring-amber-200/10 [&::-webkit-search-cancel-button]:appearance-none"
          />

          {searchInput ? (
            <button
              type="button"
              onClick={() =>
                onSearchInputChange(
                  "",
                )
              }
              aria-label="Clear warrior search"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
            >
              <X
                className="h-4 w-4"
                aria-hidden="true"
              />
            </button>
          ) : null}
        </label>

        <div className="relative flex items-center gap-1 rounded-xl border border-white/[0.07] bg-[#020711]/75 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <CommandButton
            active={
              preferences.spotlightMode !==
              "off"
            }
            disabled={
              !spotlightAvailable ||
              spotlightLoading
            }
            label={
              !spotlightAvailable
                ? "Sign in to spotlight yourself"
                : preferences.spotlightMode ===
                    "off"
                  ? "Spotlight me · center"
                  : "Exit spotlight · return to top"
            }
            onClick={
              cycleSpotlight
            }
          >
            <Crosshair
              className={`h-4 w-4 ${
                spotlightLoading
                  ? "animate-pulse"
                  : ""
              }`}
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              preferences.rankWindowStart !==
              null
            }
            label="Rank window"
            onClick={() => {
              setRankWindowOpen(
                !rankWindowOpen,
              );
              setHiddenOpen(false);
              setColumnsOpen(false);
            }}
          >
            <SlidersHorizontal
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              sortKey ===
              "rank_change_24h"
            }
            label="Movers"
            onClick={() =>
              onSort(
                "rank_change_24h",
              )
            }
          >
            <Activity
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              sortKey ===
              "streak"
            }
            label={
              sortKey !==
              "streak"
                ? "Biggest Win Streak"
                : sortDirection ===
                    "desc"
                  ? "Biggest Loss Streak"
                  : "Return to Rank Order"
            }
            onClick={() =>
              onSort(
                "streak",
              )
            }
          >
            <Flame
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              preferences.bookmarkedOnly
            }
            label="Show bookmarked warriors"
            onClick={() =>
              onPreferencesChange({
                bookmarkedOnly:
                  !preferences.bookmarkedOnly,
              })
            }
          >
            <Star
              className={`h-4 w-4 ${
                preferences.bookmarkedOnly
                  ? "fill-current"
                  : ""
              }`}
              aria-hidden="true"
            />
          </CommandButton>

          {preferences.hiddenPlayers.length >
          0 ? (
            <CommandButton
              active={hiddenOpen}
              label={`${preferences.hiddenPlayers.length} hidden warrior${preferences.hiddenPlayers.length === 1 ? "" : "s"}`}
              onClick={() => {
                setHiddenOpen(
                  !hiddenOpen,
                );
                setRankWindowOpen(false);
                setColumnsOpen(false);
              }}
            >
              <span className="relative">
                <EyeOff
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-slate-200 px-1 text-center text-[8px] font-black leading-4 text-slate-950">
                  {
                    preferences
                      .hiddenPlayers
                      .length
                  }
                </span>
              </span>
            </CommandButton>
          ) : null}

          <CommandButton
            active={
              columnsOpen ||
              preferences.columnMode ===
                "custom"
            }
            label="Columns"
            onClick={() => {
              setColumnsOpen(
                !columnsOpen,
              );
              setRankWindowOpen(false);
              setHiddenOpen(false);
            }}
          >
            <Columns3
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={false}
            label={
              preferences.drilldownMode ===
              1
                ? "Row detail: Inline · click for Docked"
                : preferences.drilldownMode ===
                    2
                  ? "Row detail: Docked · click for Modal"
                  : "Row detail: Modal · click for Inline"
            }
            onClick={() =>
              onPreferencesChange({
                drilldownMode:
                  preferences.drilldownMode ===
                  1
                    ? 2
                    : preferences.drilldownMode ===
                        2
                      ? 3
                      : 1,
              })
            }
          >
            <RowDetailModeGlyph
              mode={
                preferences.drilldownMode
              }
            />
          </CommandButton>

          <CommandButton
            active={
              preferences.dense
            }
            label="Compact row density"
            onClick={() =>
              onPreferencesChange({
                dense:
                  !preferences.dense,
              })
            }
          >
            <Rows3
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          {columnsOpen ? (
            <div
              data-living-command-popover
              className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-72 rounded-2xl border border-white/12 bg-[#040913]/98 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-2 pb-2">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Columns
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onPreferencesChange({
                      columnMode:
                        "auto",
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition ${
                    preferences.columnMode ===
                    "auto"
                      ? "border-amber-200/28 bg-amber-300/[0.09] text-amber-100"
                      : "border-white/[0.07] text-slate-500 hover:text-white"
                  }`}
                >
                  Auto
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1">
                {LIVING_LEADERBOARD_COLUMNS.map(
                  (column) => {
                    const selected =
                      preferences.visibleColumns.includes(
                        column,
                      );

                    const active =
                      preferences.columnMode ===
                        "custom" &&
                      selected;

                    return (
                      <button
                        key={column}
                        type="button"
                        onClick={() =>
                          toggleColumn(
                            column,
                          )
                        }
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.12em] transition ${
                          active
                            ? "border-cyan-200/20 bg-cyan-300/[0.065] text-cyan-50"
                            : "border-transparent text-slate-500 hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-white"
                        }`}
                      >
                        <span>
                          {
                            LIVING_COLUMN_LABELS[
                              column
                            ]
                          }
                        </span>

                        {preferences.columnMode ===
                        "custom" ? (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              selected
                                ? "bg-cyan-200"
                                : "bg-slate-800"
                            }`}
                          />
                        ) : null}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}

          {rankWindowOpen ? (
            <div
              data-living-command-popover
              className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-72 rounded-2xl border border-amber-200/16 bg-[#040913]/98 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label>
                  <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    From
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(
                      1,
                      trackedPlayers,
                    )}
                    value={
                      rankStartDraft
                    }
                    onChange={(
                      event,
                    ) =>
                      setRankStartDraft(
                        event.target
                          .value,
                      )
                    }
                    className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/35 px-3 font-black tabular-nums text-white outline-none focus:border-amber-200/40"
                  />
                </label>

                <div>
                  <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rows
                  </span>

                  <div className="mt-2 flex gap-1">
                    {LIVING_LEADERBOARD_WINDOW_ROWS.map(
                      (rows) => (
                        <button
                          key={rows}
                          type="button"
                          onClick={() =>
                            onPreferencesChange(
                              {
                                rankWindowRows:
                                  rows,
                              },
                            )
                          }
                          className={`h-10 rounded-lg border px-2.5 text-[10px] font-black tabular-nums transition ${
                            preferences.rankWindowRows ===
                            rows
                              ? "border-amber-200/30 bg-amber-300/[0.10] text-amber-100"
                              : "border-white/[0.07] bg-white/[0.02] text-slate-500 hover:text-white"
                          }`}
                        >
                          {rows}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={
                    applyRankWindow
                  }
                  className="flex-1 rounded-lg border border-amber-200/28 bg-amber-300/[0.09] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/[0.14]"
                >
                  Apply
                </button>

                {preferences.rankWindowStart !==
                null ? (
                  <button
                    type="button"
                    onClick={
                      clearRankWindow
                    }
                    className="rounded-lg border border-white/[0.08] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 transition hover:text-white"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {hiddenOpen ? (
            <div
              data-living-command-popover
              className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-80 rounded-2xl border border-white/12 bg-[#040913]/98 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-2 pb-2">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Hidden ·{" "}
                  {
                    preferences
                      .hiddenPlayers
                      .length
                  }
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onPreferencesChange({
                      hiddenPlayers:
                        [],
                    })
                  }
                  className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 hover:text-white"
                >
                  All
                </button>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto">
                {preferences.hiddenPlayers.map(
                  (entry) => (
                    <button
                      key={
                        entry.key
                      }
                      type="button"
                      onClick={() =>
                        unhideEntry(
                          entry.key,
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/[0.07] hover:bg-white/[0.035]"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-300">
                        {
                          entry.name
                        }
                      </span>

                      <Eye
                        className="h-4 w-4 shrink-0 text-slate-600"
                        aria-hidden="true"
                      />
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-[7rem] text-left lg:text-right">
          <div className="text-2xl font-black tabular-nums text-white">
            {countLabel}
          </div>

          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
            {countSublabel}
          </div>
        </div>
      </div>

      <div
        ref={tableSnapRef}
        data-leaderboard-snap="table"
        className="flex h-full min-h-full shrink-0 flex-col overflow-visible border-t border-amber-200/10 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.04),transparent_24%)] px-2 pb-2 sm:px-3 sm:pb-3 lg:px-4 lg:pb-4 [scroll-snap-align:start] [scroll-snap-stop:always]"
        aria-busy={
          loading ||
          loadingMore
        }
      >
        <div
          ref={rowScrollRef}
          data-leaderboard-row-scroll
          onScroll={handleRowsScroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]"
        >
          {loading &&
          entries.length === 0 ? (
            <div
              className="space-y-2"
              aria-label="Loading leaderboard"
            >
              {Array.from(
                { length: 8 },
                (_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl border border-white/[0.05] bg-white/[0.025]"
                  />
                ),
              )}
            </div>
          ) : visibleEntries.length ===
              0 &&
            preferences.bookmarkedOnly ? (
            <div className="grid min-h-52 place-items-center rounded-[1.35rem] border border-amber-200/10 bg-black/20">
              <Star
                className="h-7 w-7 text-amber-200/45"
                aria-label="No bookmarked warriors"
              />
            </div>
          ) : visibleEntries.length ===
              0 &&
            query ? (
            <div className="grid min-h-52 place-items-center rounded-[1.35rem] border border-white/[0.07] bg-black/20 text-slate-500">
              No warrior matches “{query}”.
            </div>
          ) : visibleEntries.length ===
            0 ? (
            <div className="grid min-h-52 place-items-center rounded-[1.35rem] border border-white/[0.07] bg-black/20 text-slate-500">
              No ranked warriors.
            </div>
          ) : (
            <LivingLeaderboardTable
              entries={
                visibleEntries
              }
              sortKey={sortKey}
              sortDirection={
                sortDirection
              }
              onSort={onSort}
              bookmarks={
                bookmarks
              }
              onToggleBookmark={
                toggleBookmark
              }
              onHideEntry={
                hideEntry
              }
              spotlightKey={
                spotlightTarget?.key ??
                null
              }
              pulseActive={
                preferences.pulseActive
              }
              dense={
                preferences.dense
              }
              columnMode={
                preferences.columnMode
              }
              visibleColumns={
                preferences.visibleColumns
              }
                          drilldownMode={
                preferences.drilldownMode
              }
/>
          )}

          {error ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300/18 bg-orange-400/[0.05] px-4 py-3 text-sm text-orange-100">
              <span>{error}</span>

              <button
                type="button"
                onClick={onRetry}
                className="font-black uppercase tracking-[0.12em] underline underline-offset-4"
              >
                Retry
              </button>
            </div>
          ) : null}

          {hasMore &&
          !loading &&
          !personalRankViewActive ? (
            <button
              type="button"
              disabled={
                loadingMore
              }
              onClick={
                onLoadMore
              }
              className="mt-3 w-full rounded-xl border border-amber-200/12 bg-amber-300/[0.035] px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/75 transition hover:border-amber-200/28 hover:bg-amber-300/[0.07] disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore
                ? "Calling warriors…"
                : "More"}
            </button>
          ) : null}
        </div>
      </div>

        <div
          id="living-leaderboard-inspector-dock"
          className="shrink-0 empty:hidden"
        />

    </section>
  );
}
