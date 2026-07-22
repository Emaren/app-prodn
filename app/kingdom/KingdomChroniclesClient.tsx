"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Coins, ExternalLink, Lock, ScrollText, Shield, Swords, TowerControl, Users } from "lucide-react";

import { kingdomChronicles, type KingdomChronicle } from "@/lib/aoe2warLeague";
import { kingdomChronicleAvatarCardUrlForName } from "@/lib/avatarAssets";

type KingdomChronicleView = "b" | "a" | "e";

const KINGDOM_BAE_FALLBACK_KEY = "aoe2war.kingdom.bae.local.v1";
const KINGDOM_CHRONICLE_AVATAR_KEY = "aoe2war.kingdom.chronicleAvatars.v1";

const kingdomBaeViews: Array<{ value: KingdomChronicleView; label: string; title: string }> = [
  { value: "b", label: "B", title: "Basic" },
  { value: "a", label: "A", title: "Advanced" },
  { value: "e", label: "E", title: "Epic" },
];

const ages = [
  {
    label: "Age I",
    title: "Dark Age",
    body: "One fire. No tribe yet.",
    state: "Mar 23 - Mar 26, 2026",
    active: false,
  },
  {
    label: "Age II",
    title: "Feudal Age",
    body: "The warband gathers.",
    state: "Mar 27 - now",
    active: true,
  },
  {
    label: "Age III",
    title: "Castle Age",
    body: "Clan walls. Royal law.",
    state: "Locked future",
    active: false,
  },
  {
    label: "Age IV",
    title: "Imperial Age",
    body: "Kingdom without end.",
    state: "Locked future",
    active: false,
  },
] as const;

function isKingdomChronicleView(value: unknown): value is KingdomChronicleView {
  return value === "b" || value === "a" || value === "e";
}

function getKingdomBaeStorageKey(session: unknown) {
  const data = session as {
    uid?: string;
    userUid?: string;
    user?: { uid?: string; id?: string; email?: string };
    session?: { user?: { uid?: string; id?: string; email?: string } };
  };

  const uid =
    data?.user?.uid ||
    data?.userUid ||
    data?.uid ||
    data?.session?.user?.uid ||
    data?.user?.id ||
    data?.session?.user?.id ||
    data?.user?.email ||
    data?.session?.user?.email;

  return uid ? `aoe2war.kingdom.bae.${uid}.v1` : KINGDOM_BAE_FALLBACK_KEY;
}

function formatWolo(value: number | null | undefined) {
  if (!value) return null;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function actorHref(actor: string | null | undefined) {
  if (!actor || actor.includes("/") || actor.includes(",")) return null;
  return `/players/by-name/${encodeURIComponent(actor)}`;
}

function txHref(txHash: string | null | undefined) {
  if (!txHash) return null;
  return `/api/wolo/tx/${encodeURIComponent(txHash)}`;
}

function chronicleHref(item: KingdomChronicle) {
  return txHref(item.txHash) || item.href || actorHref(item.actor);
}

function ChronicleIcon({ kind }: { kind: KingdomChronicle["kind"] }) {
  const className = "h-5 w-5";
  if (kind === "bounty") return <Swords className={className} />;
  if (kind === "transaction") return <Coins className={className} />;
  if (kind === "locked") return <Lock className={className} />;
  return <ScrollText className={className} />;
}

function getRoyalTitleClass(view: KingdomChronicleView) {
  if (view === "b") {
    return "mt-3 block max-w-full whitespace-nowrap pb-2 font-serif text-[clamp(0.86rem,1.82vw,2.18rem)] leading-[1.14] tracking-[-0.041em] text-stone-50";
  }

  if (view === "a") {
    return "mt-3 block max-w-full whitespace-nowrap pb-2 font-serif text-[clamp(0.86rem,1.78vw,2.08rem)] font-medium leading-[1.14] tracking-[-0.045em] text-transparent bg-gradient-to-br from-stone-50 via-amber-100 to-amber-300 bg-clip-text drop-shadow-[0_12px_26px_rgba(251,191,36,0.11)]";
  }

  return "mt-3 block max-w-full whitespace-nowrap pb-2 font-serif text-[clamp(0.86rem,1.8vw,2.12rem)] font-medium leading-[1.14] tracking-[-0.047em] text-transparent bg-gradient-to-br from-white via-amber-100 to-yellow-400 bg-clip-text drop-shadow-[0_16px_34px_rgba(251,191,36,0.15)]";
}

function getRoyalTitle() {
  return "The early kingdom, written as it happens.";
}


function getChronicleTitleClass(view: KingdomChronicleView) {
  if (view === "b") {
    return "mt-2 text-xl font-bold leading-tight text-white sm:text-2xl";
  }

  if (view === "a") {
    return "mt-2 font-serif text-[1.45rem] font-medium leading-[1.06] tracking-[-0.035em] text-transparent bg-gradient-to-br from-stone-50 via-amber-50 to-amber-300 bg-clip-text sm:text-[1.75rem]";
  }

  return "mt-2 font-serif text-[1.55rem] font-medium leading-[1.02] tracking-[-0.045em] text-transparent bg-gradient-to-br from-white via-amber-100 to-yellow-400 bg-clip-text drop-shadow-[0_10px_24px_rgba(251,191,36,0.12)] sm:text-[1.9rem]";
}

function getChronicleBodyClass(view: KingdomChronicleView) {
  if (view === "b") {
    return "mt-2 text-sm leading-6 text-slate-300";
  }

  return "mt-3 max-w-2xl text-[0.95rem] leading-7 text-slate-300/90";
}

function getQuestActor(item: KingdomChronicle) {
  return item.questActor || null;
}

function normalizeQuestActorKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, " ")
    .replace(/[^a-z0-9\[\] ]+/g, "")
    .replace(/^bdb pigman$/, "[bdb]pigman")
    .replace(/^julio alvarez$/, "julio")
    .replace(/^dil pascana$/, "dil_pascana")
    .trim();
}

function getAvatarActors(item: KingdomChronicle) {
  if (Array.isArray(item.avatarActors) && item.avatarActors.length) {
    return item.avatarActors.filter(Boolean);
  }

  const actor = item.avatarActor || item.questActor || null;
  return actor ? [actor] : [];
}

function getChronicleAvatarClass(
  item: KingdomChronicle,
  view: KingdomChronicleView,
  actorName?: string | null
) {
  const actor = String(actorName || "").toLowerCase();

  // Ghosted exceptions only:
  // Chronicle II   = Pigman seen/no contact
  // Chronicle IV   = Deltaforce signed in/no contact
  // Chronicle VIII = The Silent Seat / Dil_Pascana
  const keepGhosted =
    item.id === "pigman-sees-fire" ||
    item.id === "deltaforce-joins-quest" ||
    item.id === "silent-seat";

  // Match the current Scribe/Grimer strength:
  const strongOpacity = view === "e" ? "opacity-[0.54]" : "opacity-[0.42]";

  if (keepGhosted) {
    if (item.id === "pigman-sees-fire") {
      return "object-contain object-right-bottom opacity-[0.095] scale-[1.02] translate-y-1 saturate-[0.78] origin-bottom-right";
    }

    if (item.id === "deltaforce-joins-quest") {
      return "object-contain object-right-bottom opacity-[0.12] scale-[1.02] translate-y-1 saturate-[0.82] origin-bottom-right";
    }

    return "object-contain object-right-bottom opacity-[0.12] scale-[1.04] translate-y-2 saturate-[0.82] origin-bottom-right";
  }

  if (item.id === "scribe-enters") {
    const scribeOpacity = actor.includes("scribe")
      ? view === "e"
        ? "opacity-[0.62]"
        : "opacity-[0.50]"
      : strongOpacity;

    return `object-contain object-right-bottom ${scribeOpacity} scale-[1.04] translate-y-1 saturate-[0.98] origin-bottom-right`;
  }

  if (actor.includes("dil")) {
    return `object-contain object-right-bottom ${strongOpacity} scale-[1.06] translate-y-2 saturate-[0.82] origin-bottom-right`;
  }

  if (actor.includes("pigman")) {
    return `object-contain object-right-bottom ${strongOpacity} scale-[1.02] translate-y-1 saturate-[0.78] origin-bottom-right`;
  }

  if (actor.includes("ra")) {
    return `object-contain object-right-bottom ${strongOpacity} scale-[1.03] translate-y-1 saturate-[0.84] origin-bottom-right`;
  }

  if (actor.includes("zodiac")) {
    return `object-contain object-right-bottom ${strongOpacity} scale-[1.03] translate-y-1 saturate-[0.85] origin-bottom-right`;
  }

  return `object-contain object-right-bottom ${strongOpacity} scale-[1.02] translate-y-1 saturate-[0.84] origin-bottom-right`;
}

function getChronicleAvatarMask(
  item: KingdomChronicle,
  view: KingdomChronicleView
) {
  const keepGhosted =
    item.id === "pigman-sees-fire" ||
    item.id === "deltaforce-joins-quest" ||
    item.id === "silent-seat";

  // Ghost cards stay deliberately hidden.
  if (keepGhosted) {
    return "linear-gradient(to right, transparent 0%, transparent 18%, rgba(0,0,0,0.36) 42%, rgba(0,0,0,0.86) 68%, rgba(0,0,0,1) 100%)";
  }

  // AI Scribe / Grimer:
  // soften left edge more to kill the visible straight seam.
  if (item.id === "scribe-enters") {
    return "linear-gradient(to right, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.10) 8%, rgba(0,0,0,0.28) 18%, rgba(0,0,0,0.56) 32%, rgba(0,0,0,0.82) 48%, rgba(0,0,0,0.96) 66%, rgba(0,0,0,1) 100%)";
  }

  // All normal avatars, including Chronicle IX / Eastern Beacon,
  // use the same stronger visibility treatment.
  if (view === "e") {
    return "linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.34) 14%, rgba(0,0,0,0.66) 32%, rgba(0,0,0,0.90) 56%, rgba(0,0,0,1) 100%)";
  }

  return "linear-gradient(to right, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.22) 14%, rgba(0,0,0,0.52) 32%, rgba(0,0,0,0.84) 56%, rgba(0,0,0,1) 100%)";
}

function TimelinePin({ index, locked }: { index: number; locked: boolean }) {
  return (
    <div className="absolute -left-[2.55rem] top-6 hidden xl:block">
      <div
        className={`grid h-9 w-9 place-items-center rounded-full border ${
          locked
            ? "border-white/12 bg-black text-slate-500"
            : "border-amber-200/40 bg-[#17110a] text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.18)]"
        }`}
      >
        {locked ? <Lock className="h-4 w-4" /> : <span className="text-xs">{index + 1}</span>}
      </div>
    </div>
  );
}

function ChronicleCard({
  item,
  index,
  view,
  showAvatars,
  showQuestLabel,
}: {
  item: KingdomChronicle;
  index: number;
  view: KingdomChronicleView;
  showAvatars: boolean;
  showQuestLabel: boolean;
}) {
  const href = chronicleHref(item);
  const locked = item.kind === "locked";
  const questActor = getQuestActor(item);
  const isLoneFire = item.id === "lone-fire";
  const isFirstCoin = item.title === "The First Coin";
  const isWoloChronicles = item.title === "The Wolo Chronicles";
  const isFirstSpectatorBet = item.title === "First Spectator Bet";
  const isThreeInADay = item.id === "three-in-a-day-2026-07-12";
  const avatarActors = isFirstCoin
    ? ["Jim", "Sniper", "Julio Alvarez"]
    : getAvatarActors(item);
  const chronicleAvatarMask = getChronicleAvatarMask(item, view);

  const content = (
    <div
      className={`group relative overflow-hidden rounded-[1.55rem] border px-4 py-4 transition duration-300 sm:px-5 sm:py-5 ${
        locked
          ? "border-white/8 bg-black/20 opacity-70"
          : item.kind === "bounty"
            ? "border-amber-200/28 bg-[radial-gradient(circle_at_92%_18%,rgba(251,191,36,0.16),transparent_28%),linear-gradient(135deg,rgba(92,50,15,0.48),rgba(6,10,18,0.94))] shadow-[0_0_42px_rgba(245,158,11,0.12)] hover:border-amber-100/44"
            : "border-white/10 bg-white/[0.045] hover:-translate-y-0.5 hover:border-amber-100/22 hover:bg-white/[0.065]"
      }`}
    >
      {isLoneFire ? (
        <>
          <Image
            src="/kingdom/wolo-fire.png"
            alt=""
            fill
            aria-hidden="true"
            sizes="(max-width: 1024px) 100vw, 900px"
            className="pointer-events-none absolute inset-0 select-none object-cover object-[50%_58%] opacity-[0.24] brightness-[0.68] saturate-[0.90] contrast-[1.08]"
          />

          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,26,46,0.80)_0%,rgba(15,26,46,0.64)_38%,rgba(15,26,46,0.38)_64%,rgba(15,26,46,0.48)_100%)]" />

          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_64%,rgba(245,158,11,0.075),transparent_28%)]" />
        </>
      ) : null}

      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/30 to-transparent opacity-0 transition group-hover:opacity-100" />

      {showQuestLabel && questActor ? (
        <div
          className={`kingdom-chronicle-quest-label pointer-events-none absolute right-7 ${isThreeInADay ? "top-5 z-0" : "top-5 z-20"} max-w-[48%] overflow-hidden text-ellipsis whitespace-nowrap text-right text-[10px] font-semibold tracking-[0.18em] text-slate-400/45 sm:right-8 sm:max-w-[44%]`}
          style={
            showAvatars
              ? {
                  right: "clamp(8.65rem, 11vw, 9.85rem)",
                  maxWidth: "calc(100% - clamp(9.75rem, 13vw, 11.15rem))",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                  textOverflow: "clip",
                }
              : undefined
          }
        >
          {questActor} joined the quest.
        </div>
      ) : null}

      {isFirstCoin && showAvatars ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden h-[10.75rem] w-[10.75rem] -translate-x-1/2 -translate-y-1/2 lg:block"
          aria-hidden="true"
        >
          <Image
            src="/legacy/wolo-logo-transparent.webp"
            alt=""
            fill
            sizes="172px"
            className="select-none object-contain opacity-[0.13] brightness-[1.02] saturate-[0.95] drop-shadow-[0_12px_22px_rgba(0,0,0,0.24)]"
          />
        </div>
      ) : null}

      {isWoloChronicles ? (
        <div
          className="pointer-events-none absolute right-5 top-1/2 z-20 hidden -translate-y-1/2 sm:block"
          aria-hidden="true"
        >
          <div className="relative h-24 w-40 overflow-hidden rounded-[0.7rem] bg-black/5 shadow-[0_10px_24px_rgba(0,0,0,0.24)]">
            <Image
              src="/uploads/managed-assets/background/hero-chain-1783900681110-790uqb-1783900686992-b7c63a29.png"
              alt=""
              fill
              sizes="160px"
              className={`select-none object-contain object-center ${
                view === "e" ? "opacity-[0.76]" : "opacity-[0.68]"
              } brightness-[1.08] saturate-[0.96] contrast-[1.12]`}
            />
          </div>
        </div>
      ) : null}

      {isFirstSpectatorBet ? (
        <div
          className="pointer-events-none absolute right-7 top-1/2 z-20 hidden -translate-y-1/2 sm:grid"
          aria-hidden="true"
        >
          <div className="grid h-24 w-24 place-items-center text-[4.8rem] leading-none opacity-[0.80] drop-shadow-[0_14px_28px_rgba(0,0,0,0.58)]">
            💸
          </div>
        </div>
      ) : null}

      {showAvatars && avatarActors.length ? (
        <div
          className={[
            "pointer-events-none absolute inset-y-0 right-0 z-10 hidden overflow-hidden sm:block lg:right-0",
            avatarActors.length === 3
              ? "w-[18rem] lg:w-[22rem]"
              : "w-[11.5rem] lg:w-[14rem]",
          ].join(" ")}
          style={{
            WebkitMaskImage: chronicleAvatarMask,
            maskImage: chronicleAvatarMask,
          }}
        >
          {avatarActors.map((actorName, actorIndex) => (
            <div
              key={`${item.id}-${actorName}`}
              className={
                avatarActors.length === 3
                  ? actorIndex === 0
                    ? "absolute inset-y-0 right-[9.2rem] w-[8.5rem] lg:right-[11.5rem] lg:w-[9.75rem]"
                    : actorIndex === 1
                      ? "absolute inset-y-0 right-[4.6rem] w-[8.5rem] lg:right-[5.75rem] lg:w-[9.75rem]"
                      : "absolute inset-y-0 right-0 w-[8.5rem] lg:w-[9.75rem]"
                  : avatarActors.length > 1
                    ? actorIndex === 0
                      ? "absolute inset-y-0 right-[5rem] w-[9.5rem] lg:right-[6.6rem] lg:w-[10.75rem]"
                      : "absolute inset-y-0 right-0 w-[9.5rem] lg:w-[10.75rem]"
                    : "absolute inset-y-0 right-0 w-full"
              }
            >
              <Image
                src={kingdomChronicleAvatarCardUrlForName(actorName)}
                alt=""
                fill
                sizes="(max-width: 1024px) 0px, 260px"
                className={getChronicleAvatarClass(item, view, actorName)}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div
        data-kingdom-chronicle-avatar-mode={showAvatars ? "true" : "false"}
        data-kingdom-chronicle-view={view}
        className="relative z-10 grid min-w-0 max-w-full gap-4 kingdom-chronicle-card-grid lg:grid-cols-[minmax(0,1fr)_minmax(11.5rem,0.64fr)_auto] lg:items-center xl:grid-cols-[minmax(0,1.18fr)_minmax(12rem,0.68fr)_auto]"
      >
        <div className="min-w-0 max-w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${
                locked
                  ? "border-white/10 bg-white/[0.035] text-slate-500"
                  : "border-amber-100/20 bg-amber-300/10 text-amber-100/86"
              }`}
            >
              {item.label}
            </span>
            <span className="text-xs text-slate-500">{item.dateLabel}</span>
          </div>

          <h2 className={`kingdom-chronicle-title ${getChronicleTitleClass(view)}`}>{item.title}</h2>
          <p className={getChronicleBodyClass(view)}>{item.body}</p>
        </div>

        <div className="min-w-0 max-w-full">
          <div className="flex flex-wrap gap-2">
            {item.actor ? (
              <span className={`kingdom-chronicle-actor-chip rounded-full border px-3 py-1 text-xs ${
                showAvatars
                  ? "border-white/10 bg-white/[0.05] text-slate-300/78"
                  : "border-sky-200/16 bg-sky-300/10 text-sky-100"
              }`}>
                {item.actor}
              </span>
            ) : null}
            {!showAvatars && item.amountWolo ? (
              <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">
                {formatWolo(item.amountWolo)} WOLO
              </span>
            ) : null}
            {!showAvatars && item.status ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
                {item.status}
              </span>
            ) : null}
          </div>
          {item.txHash ? (
            <div className="mt-2 max-w-full truncate font-mono text-xs text-emerald-100/90">
              {item.txHash}
            </div>
          ) : !locked && item.kind === "transaction" && !href ? (
            <div className="mt-2 text-xs text-slate-500">Proof pending in the indexed rail</div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 lg:justify-end">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
              locked
                ? "border-white/10 bg-white/[0.04] text-slate-500"
                : "border-amber-100/24 bg-amber-300/10 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.10)]"
            }`}
          >
            <ChronicleIcon kind={item.kind} />
          </div>

          {href ? <ExternalLink className="h-4 w-4 text-slate-500 transition group-hover:text-amber-100" /> : null}
        </div>
      </div>
    </div>
  );

  if (!href) {
    return (
      <div className="relative">
        <TimelinePin index={index} locked={locked} />
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="relative block">
      <TimelinePin index={index} locked={locked} />
      {content}
    </Link>
  );
}

export default function KingdomChroniclesClient() {
  const [chronicleView, setChronicleView] = useState<KingdomChronicleView>("e");
  const [baeStorageKey, setBaeStorageKey] = useState<string | null>(null);
  const [showChronicleAvatars, setShowChronicleAvatars] = useState(true);

  const persistKingdomChroniclePreferences = useCallback(
    async (view: KingdomChronicleView, avatarsEnabled: boolean) => {
      try {
        await fetch("/api/user/kingdom-chronicle-preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ view, avatarsEnabled }),
        });
      } catch {
        // Anonymous visitors still keep the local premium default.
      }
    },
    []
  );

  const chooseChronicleView = useCallback(
    (view: KingdomChronicleView) => {
      setChronicleView(view);
      if (baeStorageKey) {
        try {
          window.localStorage.setItem(baeStorageKey, view);
        } catch {
          // Ignore private-mode/localStorage failures.
        }
      }
      void persistKingdomChroniclePreferences(view, showChronicleAvatars);
    },
    [baeStorageKey, persistKingdomChroniclePreferences, showChronicleAvatars]
  );

  const toggleChronicleAvatars = useCallback(() => {
    setShowChronicleAvatars((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(KINGDOM_CHRONICLE_AVATAR_KEY, next ? "1" : "0");
      } catch {
        // Ignore private-mode/localStorage failures.
      }
      void persistKingdomChroniclePreferences(chronicleView, next);
      return next;
    });
  }, [chronicleView, persistKingdomChroniclePreferences]);

  const firstQuestChronicleIds = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<string>();

    for (const item of kingdomChronicles) {
      const actor = getQuestActor(item);
      const key = normalizeQuestActorKey(actor);

      if (!actor || !key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      ids.add(item.id);
    }

    return ids;
  }, []);

  useEffect(() => {
    try {
      setShowChronicleAvatars(window.localStorage.getItem(KINGDOM_CHRONICLE_AVATAR_KEY) !== "0");
    } catch {
      setShowChronicleAvatars(true);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KINGDOM_CHRONICLE_AVATAR_KEY, showChronicleAvatars ? "1" : "0");
    } catch {
      // Keep the page usable when local storage is blocked.
    }
  }, [showChronicleAvatars]);

  useEffect(() => {
    let alive = true;

    async function loadKingdomBaePreference() {
      let storageKey = KINGDOM_BAE_FALLBACK_KEY;

      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
        });

        if (response.ok) {
          const session = await response.json();
          storageKey = getKingdomBaeStorageKey(session);
        }
      } catch {
        storageKey = KINGDOM_BAE_FALLBACK_KEY;
      }

      if (!alive) return;

      setBaeStorageKey(storageKey);

      try {
        const saved = window.localStorage.getItem(storageKey);
        if (isKingdomChronicleView(saved)) {
          setChronicleView(saved);
        }
      } catch {
        setChronicleView("e");
      }
    }

    void loadKingdomBaePreference();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!baeStorageKey) return;

    try {
      window.localStorage.setItem(baeStorageKey, chronicleView);
    } catch {
      // Keep the page usable when local storage is blocked.
    }
  }, [baeStorageKey, chronicleView]);

  return (
    <section
      id="chronicles"
      className="grid gap-6 scroll-mt-28 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]"
    >
      <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {ages.map((age) => (
          <article
            key={age.label}
            className={`relative overflow-hidden rounded-[1.55rem] border px-5 py-5 ${
              age.active
                ? "border-amber-100/38 bg-[radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.16),transparent_32%),linear-gradient(180deg,rgba(23,70,44,0.42),rgba(8,12,18,0.94))] shadow-[0_0_42px_rgba(245,158,11,0.12)]"
                : "border-white/10 bg-black/24"
            }`}
          >
            <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">
              {age.label}
            </div>
            <div className="mt-2 font-serif text-2xl text-amber-50">{age.title}</div>
            <p className="mt-4 text-sm leading-6 text-slate-300">{age.body}</p>
            <div className="mt-4 text-xs text-slate-500">{age.state}</div>
          </article>
        ))}
      </aside>

      <div className="relative xl:border-l xl:border-amber-100/12 xl:pl-10">
        <div
          className="relative mb-5 cursor-pointer overflow-hidden rounded-[1.85rem] border border-amber-100/20 bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.16),transparent_32%),radial-gradient(circle_at_88%_14%,rgba(59,130,246,0.12),transparent_34%),linear-gradient(145deg,rgba(20,25,38,0.96),rgba(3,7,18,0.86))] p-5 shadow-[0_24px_72px_rgba(0,0,0,0.28)] ring-1 ring-white/[0.04] sm:p-6"
          role="button"
          tabIndex={0}
          aria-pressed={showChronicleAvatars}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button,a")) return;
            toggleChronicleAvatars();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            if ((event.target as HTMLElement).closest("button,a")) return;
            event.preventDefault();
            toggleChronicleAvatars();
          }}
        >
          <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />
          <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />

          <div
            className="absolute right-4 top-4 z-20 inline-flex rounded-full border border-white/12 bg-slate-950/70 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.38)] backdrop-blur-md"
            aria-label="Kingdom chronicle view"
          >
            {kingdomBaeViews.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseChronicleView(option.value)}
                className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                  chronicleView === option.value
                    ? "bg-amber-100 text-slate-950 shadow-[0_0_22px_rgba(251,191,36,0.22)]"
                    : "text-slate-500 hover:bg-white/10 hover:text-amber-100"
                }`}
                title={option.title}
                aria-pressed={chronicleView === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2 pr-24 text-[10px] font-black uppercase tracking-[0.34em] text-amber-100/72 sm:pr-32">
              <span className="inline-flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                The Royal Chronicle
              </span>
              <span className="inline-flex rounded-full border border-amber-100/14 bg-amber-200/[0.06] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/62">
                On-chain memory
              </span>
            </div>

            <h2 className={getRoyalTitleClass(chronicleView)}>{getRoyalTitle()}</h2>
          </div>
        </div>

        <div className="space-y-3">
          {kingdomChronicles.map((item, index) => (
            <ChronicleCard
              key={item.id}
              item={item}
              index={index}
              view={chronicleView}
              showAvatars={showChronicleAvatars}
              showQuestLabel={firstQuestChronicleIds.has(item.id)}
            />
          ))}
        </div>

        <div className="mt-6 text-center text-xs font-black uppercase tracking-[0.34em] text-slate-500">
          More chronicles will be written.
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-[1.55rem] border border-amber-100/16 bg-[linear-gradient(180deg,rgba(120,71,16,0.16),rgba(0,0,0,0.24))] p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-amber-100/72">
            <TowerControl className="h-4 w-4" />
            About
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            This is the on-chain history of AoE2WAR. Every Chronicle is a major event in the
            kingdom. Every Bounty is a reward for those who build it.
          </p>
        </div>

        <div className="rounded-[1.55rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-slate-500">
            <Shield className="h-4 w-4" />
            Legend
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="kingdom-chronicle-chip-rail flex min-w-0 flex-wrap items-center gap-2">
              <ScrollText className="h-4 w-4 text-amber-100" />
              Chronicle
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Swords className="h-4 w-4 text-amber-100" />
              Bounty
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Coins className="h-4 w-4 text-amber-100" />
              Transaction
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Lock className="h-4 w-4 text-slate-500" />
              Locked future
            </div>
          </div>
        </div>

        <div className="rounded-[1.55rem] border border-white/10 bg-white/[0.035] p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-slate-500">
            <Users className="h-4 w-4" />
            Citizens
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-300">
            <Link href="/players/by-name/Emaren" className="hover:text-amber-100">
              Emaren
            </Link>
            <Link href="/players/by-name/%5BBDB%5DPigman" className="hover:text-amber-100">
              [BDB]Pigman
            </Link>
            <Link href="/players/by-name/Julio%20Alvarez" className="hover:text-amber-100">
              Julio Alvarez
            </Link>
            <Link href="/players/by-name/Deltaforce" className="hover:text-amber-100">
              Deltaforce
            </Link>
            <Link href="/players/by-name/Sniper" className="hover:text-amber-100">
              Sniper
            </Link>
            <Link href="/players/by-name/Jim" className="hover:text-amber-100">
              Jim
            </Link>
            <Link href="/players/by-name/Dil_Pascana" className="hover:text-amber-100">
              Dil_Pascana
            </Link>
            <span>- Ra 𓁛𓇳</span>
            <Link href="/players/by-name/Sladk0Eshka" className="hover:text-amber-100">
              Sladk0Eshka
            </Link>
            <Link href="/zodiac" className="hover:text-amber-100">
              Zodiac
            </Link>
            <Link href="/players/by-name/Maxi" className="hover:text-amber-100">
              Maxi
            </Link>
            <Link href="/players/by-name/Tekki" className="hover:text-amber-100">
              Tekki
            </Link>
            <Link href="/players/by-name/BeTiKo" className="hover:text-amber-100">
              BeTiKo
            </Link>
            <Link href="/players/by-name/LeGenD_Sultan" className="hover:text-amber-100">
              LeGenD_Sultan
            </Link>
            <Link href="/players/by-name/Scavanger_Ab" className="hover:text-amber-100">
              Scavanger_Ab
            </Link>
          </div>
        </div>

        <div className="rounded-[1.55rem] border border-emerald-100/12 bg-[radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.14),transparent_34%),rgba(255,255,255,0.035)] p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-emerald-100/70">
            <Users className="h-4 w-4" />
            Ledger
          </div>
          <div className="mt-4 grid gap-3">
            <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Kingdom wealth
              </div>
              <div className="mt-1 text-lg font-black text-white">100,000,000 WOLO</div>
            </div>
            <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Watchers active
              </div>
              <div className="mt-1 text-lg font-black text-white">3</div>
            </div>
            <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Citizens
              </div>
              <div className="mt-1 text-lg font-black text-white">18</div>
            </div>
            <div className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Joined the quest
              </div>
              <div className="mt-1 text-lg font-black text-white">18</div>
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}
