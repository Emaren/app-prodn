"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  circularWarriorOffset,
  moveWarriorIndex,
  shouldRotateBountyCarousel,
  visibleWarriorIndexes,
} from "@/lib/bountyHall";
import type { BountyBoardSnapshot } from "@/lib/bounties";

type HallWarrior = BountyBoardSnapshot["hall"]["warriors"][number];
type LedgerEntry = BountyBoardSnapshot["ledger"][number];

const AUTO_ROTATE_MS = 9_000;
const MANUAL_PAUSE_MS = 13_000;

const SPRING = {
  type: "spring" as const,
  stiffness: 190,
  damping: 27,
  mass: 0.82,
};

function positionStyle(offset: number) {
  const distance = Math.abs(offset);

  if (offset === 0) {
    return {
      left: "50%",
      scale: 1.12,
      opacity: 1,
      y: "-50%",
      filter: "brightness(1)",
    };
  }

  if (distance === 1) {
    return {
      left: offset < 0 ? "27%" : "73%",
      scale: 0.77,
      opacity: 0.78,
      y: "-50%",
      filter: "brightness(0.72)",
    };
  }

  return {
    left: offset < 0 ? "8%" : "92%",
    scale: 0.52,
    opacity: 0.28,
    y: "-50%",
    filter: "brightness(0.42) blur(1.2px)",
  };
}

function ambientClass(value: string) {
  const palettes = [
    "from-blue-400/12 via-amber-300/[0.04] to-transparent",
    "from-violet-500/16 via-amber-300/[0.04] to-transparent",
    "from-red-500/14 via-amber-400/[0.05] to-transparent",
    "from-emerald-400/10 via-slate-300/[0.03] to-transparent",
    "from-cyan-400/10 via-amber-300/[0.03] to-transparent",
  ];
  const hash = [...value].reduce((total, character) => {
    return (total * 31 + character.charCodeAt(0)) >>> 0;
  }, 0);

  return palettes[hash % palettes.length];
}

function claimedHistory(
  board: BountyBoardSnapshot,
  warrior: HallWarrior,
) {
  if (!warrior.uid || warrior.mystery) return [];

  return board.ledger
    .filter(
      (entry) =>
        entry.status === "paid" &&
        entry.actorUid === warrior.uid &&
        Boolean(entry.txHash),
    )
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
}

function historyValue(history: LedgerEntry[]) {
  return history.reduce(
    (total, entry) => total + (entry.amountWolo ?? 0),
    0,
  );
}

function formatWolo(value: number) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

function bountyStatusLabel(status: string) {
  if (status === "in_progress") return "In Pursuit";
  if (status === "historical") return "Closed";
  return "Open";
}

function emptyNextBounty(warrior: HallWarrior) {
  if (warrior.mystery) {
    return {
      eyebrow: "Claim Your Place",
      title: "Write the First Line",
      description:
        "Claim this warrior profile and become eligible for a personal contract in the Hall.",
      reward: "No bounty posted yet",
      verification: "A claimed profile and published contract are required.",
      expiresAt: null,
    };
  }

  return {
    eyebrow: "No Active Contract",
    title: "The Kingdom Has Not Posted the Next Deed",
    description:
      "This warrior remains in the Hall, but no personal bounty is currently published.",
    reward: "Unpublished",
    verification: "No proof requirement is active.",
    expiresAt: null,
  };
}

export default function BountyWarriorCarousel({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  const warriors = board.hall.warriors;
  const initialIndex = Math.max(
    0,
    warriors.findIndex(
      (warrior) => warrior.id === board.hall.initialWarriorId,
    ),
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const manualPauseUntilRef = useRef(0);
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveIndex((current) =>
      warriors.length ? Math.min(current, warriors.length - 1) : 0,
    );
  }, [warriors.length]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const move = useCallback(
    (direction: -1 | 1, manual = true) => {
      if (manual) {
        manualPauseUntilRef.current = Date.now() + MANUAL_PAUSE_MS;
      }
      setActiveIndex((current) =>
        moveWarriorIndex(current, direction, warriors.length),
      );
    },
    [warriors.length],
  );

  const spotlight = useCallback(
    (index: number) => {
      manualPauseUntilRef.current = Date.now() + MANUAL_PAUSE_MS;
      setActiveIndex(index);
    },
    [],
  );

  useEffect(() => {
    if (warriors.length <= 1) return;

    const timer = window.setInterval(() => {
      if (
        shouldRotateBountyCarousel({
          documentVisible,
          focused,
          hovered,
          manualPauseUntil: manualPauseUntilRef.current,
          now: Date.now(),
          reducedMotion,
          touching,
        })
      ) {
        move(1, false);
      }
    }, AUTO_ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [documentVisible, focused, hovered, move, reducedMotion, touching, warriors.length]);

  const activeWarrior = warriors[activeIndex];
  const history = useMemo(
    () => (activeWarrior ? claimedHistory(board, activeWarrior) : []),
    [activeWarrior, board],
  );
  const lifetimeValue = useMemo(() => historyValue(history), [history]);
  const visibleIndexes = useMemo(
    () => visibleWarriorIndexes(warriors.length, activeIndex),
    [activeIndex, warriors.length],
  );

  if (!activeWarrior) return null;

  const bounty = activeWarrior.nextBounty;
  const emptyBounty = emptyNextBounty(activeWarrior);
  const expiresAt = bounty?.expiresAt ?? null;

  return (
    <section
      tabIndex={0}
      aria-label="Hall of Bounties warrior carousel"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          move(1);
        }
      }}
      onTouchStart={(event) => {
        setTouching(true);
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartXRef.current;
        const end = event.changedTouches[0]?.clientX ?? null;
        touchStartXRef.current = null;
        setTouching(false);

        if (start === null || end === null) return;
        const distance = end - start;
        if (Math.abs(distance) < 45) return;
        move(distance > 0 ? -1 : 1);
      }}
      onTouchCancel={() => {
        touchStartXRef.current = null;
        setTouching(false);
        manualPauseUntilRef.current =
          Date.now() + MANUAL_PAUSE_MS;
      }}
      className="relative mt-10 overflow-hidden rounded-[3rem] border border-amber-100/20 bg-[radial-gradient(circle_at_50%_-20%,rgba(251,191,36,0.16),transparent_34%),linear-gradient(180deg,#0b0c12_0%,#070911_48%,#050710_100%)] shadow-[0_48px_170px_rgba(0,0,0,0.58),0_0_100px_rgba(251,191,36,0.055)] outline-none focus-visible:ring-1 focus-visible:ring-amber-100/30"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeWarrior.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.55 }}
          className={`pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-gradient-to-b ${ambientClass(
            activeWarrior.id,
          )}`}
        />
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/75 to-transparent" />

      <div className="relative z-10 px-4 pb-8 pt-10 sm:px-7 lg:px-10 lg:pb-10">
        <header className="mx-auto max-w-4xl text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.52em] text-amber-100/65">
            The Hall of Bounties
          </div>
          <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
            {String(activeIndex + 1).padStart(2, "0")} / {String(warriors.length).padStart(2, "0")}
          </div>
        </header>

        <div className="relative mx-auto mt-8 h-[21rem] max-w-[88rem] overflow-hidden sm:h-[25rem] lg:h-[29rem]">
          <button
            type="button"
            aria-label="Previous bounty warrior"
            onClick={() => move(-1)}
            className="group absolute inset-y-0 left-0 z-10 w-1/2 cursor-w-resize"
          >
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl font-light text-white/0 transition duration-300 group-hover:text-amber-100/28 sm:left-7">
              ‹
            </span>
          </button>

          <button
            type="button"
            aria-label="Next bounty warrior"
            onClick={() => move(1)}
            className="group absolute inset-y-0 right-0 z-10 w-1/2 cursor-e-resize"
          >
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl font-light text-white/0 transition duration-300 group-hover:text-amber-100/28 sm:right-7">
              ›
            </span>
          </button>

          {visibleIndexes.map((index) => {
            const warrior = warriors[index];
            const offset = circularWarriorOffset(index, activeIndex, warriors.length);
            const active = offset === 0;
            const position = positionStyle(offset);

            return (
              <motion.button
                key={warrior.id}
                type="button"
                onClick={() => spotlight(index)}
                aria-label={`Spotlight ${warrior.name}`}
                aria-current={active ? "true" : undefined}
                initial={false}
                animate={{
                  left: position.left,
                  x: "-50%",
                  y: position.y,
                  scale: position.scale,
                  opacity: position.opacity,
                  filter: position.filter,
                }}
                transition={reducedMotion ? { duration: 0 } : SPRING}
                className={`absolute top-1/2 z-20 w-32 cursor-pointer outline-none sm:w-44 lg:w-56 ${
                  active ? "z-30" : ""
                }`}
              >
                <div
                  className={`relative mx-auto aspect-[4/5] overflow-hidden rounded-[2rem] border bg-black shadow-[0_24px_70px_rgba(0,0,0,0.48)] transition duration-500 ${
                    active
                      ? "border-amber-100/45 shadow-[0_34px_95px_rgba(0,0,0,0.62),0_0_55px_rgba(251,191,36,0.14)]"
                      : "border-white/10"
                  }`}
                >
                  <Image
                    src={warrior.imageUrl}
                    alt={
                      warrior.mystery
                        ? "Unclaimed warrior silhouette"
                        : `${warrior.name} bounty warrior`
                    }
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 224px"
                    className={`object-cover object-top transition duration-700 ${
                      warrior.mystery
                        ? "scale-105 grayscale brightness-[0.22] contrast-125"
                        : active
                          ? "scale-100"
                          : "scale-[1.025]"
                    }`}
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-transparent to-white/[0.025]" />
                  {warrior.mystery ? (
                    <div className="pointer-events-none absolute inset-0 bg-black/20" />
                  ) : null}
                </div>

                <motion.div
                  animate={{ opacity: active ? 1 : 0.58, y: active ? 0 : -2 }}
                  transition={{ duration: reducedMotion ? 0 : 0.35 }}
                  className="mt-4 text-center"
                >
                  <div
                    className={`font-semibold text-white ${
                      active ? "text-xl sm:text-2xl" : "text-sm sm:text-base"
                    }`}
                  >
                    {warrior.name}
                  </div>
                  {active && warrior.mystery ? (
                    <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.28em] text-amber-100/55">
                      Your place is waiting
                    </div>
                  ) : null}
                </motion.div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeWarrior.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{
              duration: reducedMotion ? 0 : 0.38,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="mx-auto max-w-6xl"
          >
            <div className="text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-100/50">
                Warrior in the Spotlight
              </div>
              <Link
                href={activeWarrior.href}
                className="mt-2 inline-block font-serif text-4xl text-white transition hover:text-amber-100 sm:text-5xl"
              >
                {activeWarrior.name}
              </Link>
              <div className="mt-2 text-xs text-slate-600">
                {activeWarrior.battlefieldLabel}
              </div>
            </div>

            <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
              <div className="rounded-[1.35rem] border border-white/9 bg-black/28 p-5 text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">
                  Verified Bounties Claimed
                </div>
                <div className="mt-2 text-3xl font-semibold text-white">
                  {history.length}
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-amber-100/10 bg-amber-300/[0.035] p-5 text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">
                  Verified Bounty Earnings
                </div>
                <div className="mt-2 text-2xl font-semibold text-amber-100 sm:text-3xl">
                  {formatWolo(lifetimeValue)} WOLO
                </div>
              </div>
            </div>

            <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <section className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-6 sm:p-7">
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0px,transparent_14px,rgba(255,255,255,0.012)_14px,rgba(255,255,255,0.012)_15px)]" />

                <div className="relative flex items-center justify-between gap-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.34em] text-amber-100/55">
                    {bounty ? "Next Bounty" : emptyBounty.eyebrow}
                  </div>
                  <div className="rounded-full border border-amber-100/12 bg-amber-300/[0.045] px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-100/65">
                    {bounty ? bountyStatusLabel(bounty.status) : "Unposted"}
                  </div>
                </div>

                <h2 className="relative mt-5 font-serif text-3xl text-slate-100 sm:text-4xl">
                  {bounty?.title ?? emptyBounty.title}
                </h2>
                <p className="relative mt-4 text-sm leading-7 text-slate-400">
                  {bounty?.description ?? emptyBounty.description}
                </p>

                <div className="relative mt-6 rounded-2xl border border-amber-100/10 bg-black/20 p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.23em] text-slate-600">
                    Reward
                  </div>
                  <div className="mt-2 text-xl font-semibold text-amber-100">
                    {bounty?.rewardWolo !== null && bounty?.rewardWolo !== undefined
                      ? `${formatWolo(bounty.rewardWolo)} WOLO`
                      : emptyBounty.reward}
                  </div>
                </div>

                <div className="relative mt-5 text-[10px] leading-5 text-slate-500">
                  <span className="font-bold uppercase tracking-[0.16em] text-slate-600">
                    Proof required:
                  </span>{" "}
                  {bounty?.verification || emptyBounty.verification}
                </div>

                {expiresAt ? (
                  <div className="relative mt-3 text-[10px] text-slate-600">
                    Expires {new Date(expiresAt).toLocaleString()}
                  </div>
                ) : null}
              </section>

              <section className="rounded-[2rem] border border-amber-100/10 bg-black/24 p-5 sm:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.34em] text-amber-100/50">
                      The Bounty Chronicle
                    </div>
                    <h2 className="mt-2 font-serif text-3xl text-white">
                      {activeWarrior.mystery
                        ? "The Chronicle Has Not Begun"
                        : `${activeWarrior.name}'s Claimed Bounties`}
                    </h2>
                  </div>
                  {!activeWarrior.mystery ? (
                    <div className="shrink-0 text-xs text-slate-600">Newest ↑</div>
                  ) : null}
                </div>

                <div className="mt-5 max-h-[24rem] space-y-3 overflow-y-auto pr-2 [scrollbar-color:rgba(251,191,36,0.28)_transparent] [scrollbar-width:thin]">
                  {history.length ? (
                    history.map((entry, index) => (
                      <article
                        key={entry.key}
                        className="relative rounded-2xl border border-white/8 bg-white/[0.028] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-100/55">
                            {index === history.length - 1
                              ? "First Verified Bounty"
                              : "Verified Bounty"}
                          </div>
                          {entry.amountWolo !== null ? (
                            <div className="text-sm font-bold text-amber-100">
                              {formatWolo(entry.amountWolo)} WOLO
                            </div>
                          ) : null}
                        </div>

                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {entry.memo}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-slate-600">
                          <time>
                            {new Date(entry.occurredAt).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </time>
                          <span className="text-emerald-200/60">Paid on-chain ✓</span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="flex min-h-[15rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/8 bg-black/15 px-6 text-center">
                      <div className="text-4xl text-white/12">◇</div>
                      <div className="mt-4 text-sm font-semibold text-slate-400">
                        No verified bounty has yet been claimed.
                      </div>
                      <div className="mt-2 max-w-sm text-xs leading-6 text-slate-600">
                        The Chronicle begins when an identified warrior receives a transaction-proven bounty payout.
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
