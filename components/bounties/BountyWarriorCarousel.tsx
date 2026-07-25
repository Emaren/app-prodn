"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { avatarCardUrlForName } from "@/lib/avatarAssets";
import type { BountyBoardSnapshot } from "@/lib/bounties";

type LedgerEntry =
  BountyBoardSnapshot["ledger"][number];

type MysteryWarrior = {
  key: string;
  name: string;
  href: string;
  rank: number | null;
};

type NextMission = {
  title: string;
  description: string;
  reward: string;
};

type BountyWarrior = {
  id: string;
  name: string;
  aliases: string[];
  href: string;
  imageUrl: string;
  mystery?: boolean;
  rank?: number | null;
  mission: NextMission;
};

const MYSTERY_STORAGE_KEY =
  "aoe2war:bounty-hall:mystery-warrior:v1";

const SPRING = {
  type: "spring" as const,
  stiffness: 190,
  damping: 27,
  mass: 0.82,
};

const NEXT_MISSIONS: Record<
  string,
  NextMission
> = {
  julio: {
    title:
      "Raise the Mexican Standard",
    description:
      "Complete the next verified deed posted for Julio and add another chapter to his bounty chronicle.",
    reward:
      "Reward locked until proof",
  },

  sniper: {
    title:
      "One Shot Above Your Weight",
    description:
      "Defeat a stronger ranked opponent in a verified battle worthy of the Bounty Board.",
    reward:
      "Reward locked until proof",
  },

  jim: {
    title:
      "Arabia, Jim. Arabia.",
    description:
      "Win a verified ranked 1v1 on Arabia and force the Kingdom to finally write it into the record.",
    reward:
      "Reward locked until proof",
  },

  zodiac: {
    title:
      "Hold the Summit",
    description:
      "Complete the next verified deed while carrying the weight of the realm's highest-ranked warriors.",
    reward:
      "Reward locked until proof",
  },

  mystery: {
    title:
      "Write the First Line",
    description:
      "Claim your warrior profile, answer a posted bounty, and earn your first place in the Chronicle.",
    reward:
      "Your first bounty awaits",
  },
};

function normalizeName(
  value:
    | string
    | null
    | undefined,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function entryBelongsToWarrior(
  entry: LedgerEntry,
  aliases: string[],
) {
  const normalizedAliases =
    aliases.map(normalizeName);

  const actor =
    normalizeName(entry.actor);

  if (
    actor &&
    normalizedAliases.some(
      (alias) =>
        actor === alias,
    )
  ) {
    return true;
  }

  /*
   * Old bounty rows are not always
   * perfectly actor-labelled.
   *
   * Only fall back to memo matching
   * when actor is absent so we do not
   * accidentally credit a bounty that
   * merely mentions another warrior.
   */
  if (actor) {
    return false;
  }

  const memo =
    normalizeName(entry.memo);

  return normalizedAliases.some(
    (alias) =>
      alias.length >= 3 &&
      memo.includes(alias),
  );
}

function claimedHistory(
  board: BountyBoardSnapshot,
  warrior: BountyWarrior,
) {
  if (warrior.mystery) {
    return [];
  }

  return board.ledger
    .filter(
      (entry) =>
        entry.status === "paid" &&
        entryBelongsToWarrior(
          entry,
          warrior.aliases,
        ),
    )
    .sort(
      (left, right) =>
        new Date(
          right.occurredAt,
        ).getTime() -
        new Date(
          left.occurredAt,
        ).getTime(),
    );
}

function historyValue(
  history: LedgerEntry[],
) {
  return history.reduce(
    (total, entry) =>
      total +
      (entry.amountWolo ?? 0),
    0,
  );
}

function wrappedOffset(
  index: number,
  active: number,
  length: number,
) {
  let offset =
    index - active;

  const half =
    Math.floor(length / 2);

  if (offset > half) {
    offset -= length;
  }

  if (offset < -half) {
    offset += length;
  }

  return offset;
}

function positionStyle(
  offset: number,
) {
  const distance =
    Math.abs(offset);

  if (offset === 0) {
    return {
      left: "50%",
      scale: 1.12,
      opacity: 1,
      y: "-50%",
      filter:
        "brightness(1)",
    };
  }

  if (distance === 1) {
    return {
      left:
        offset < 0
          ? "27%"
          : "73%",
      scale: 0.77,
      opacity: 0.78,
      y: "-50%",
      filter:
        "brightness(0.72)",
    };
  }

  return {
    left:
      offset < 0
        ? "8%"
        : "92%",
    scale: 0.52,
    opacity: 0.28,
    y: "-50%",
    filter:
      "brightness(0.42) blur(1.2px)",
  };
}

function ambientClass(
  id: string,
) {
  switch (id) {
    case "jim":
      return "from-blue-400/12 via-amber-300/[0.04] to-transparent";

    case "zodiac":
      return "from-violet-500/16 via-amber-300/[0.04] to-transparent";

    case "julio":
      return "from-red-500/14 via-amber-400/[0.05] to-transparent";

    case "sniper":
      return "from-emerald-400/10 via-slate-300/[0.03] to-transparent";

    default:
      return "from-slate-300/[0.06] via-amber-300/[0.03] to-transparent";
  }
}

function buildClaimedWarriors(): BountyWarrior[] {
  return [
    {
      id: "julio",
      name: "Julio Alvarez",
      aliases: [
        "Julio",
        "Julio Alvarez",
      ],
      href:
        "/players/by-name/Julio%20Alvarez",
      imageUrl:
        avatarCardUrlForName(
          "Julio Alvarez",
        ),
      mystery: false,
      mission:
        NEXT_MISSIONS.julio,
    },

    {
      id: "sniper",
      name: "Sniper",
      aliases: [
        "Sniper",
      ],
      href:
        "/players/by-name/Sniper",
      imageUrl:
        avatarCardUrlForName(
          "Sniper",
        ),
      mystery: false,
      mission:
        NEXT_MISSIONS.sniper,
    },

    {
      id: "jim",
      name: "Jim",
      aliases: [
        "Jim",
      ],
      href:
        "/players/by-name/Jim",
      imageUrl:
        avatarCardUrlForName(
          "Jim",
        ),
      mystery: false,
      mission:
        NEXT_MISSIONS.jim,
    },

    {
      id: "zodiac",
      name: "Zodiac",
      aliases: [
        "Zodiac",
      ],
      href:
        "/players/by-name/Zodiac",
      imageUrl:
        avatarCardUrlForName(
          "Zodiac",
        ),
      mystery: false,
      mission:
        NEXT_MISSIONS.zodiac,
    },
  ];
}

export default function BountyWarriorCarousel({
  board,
}: {
  board: BountyBoardSnapshot;
}) {
  const claimedWarriors =
    useMemo(
      () =>
        buildClaimedWarriors(),
      [],
    );

  /*
   * Jim begins in the throne position.
   *
   * Array:
   * Julio · Sniper · Jim · Zodiac · Mystery
   */
  const [
    activeIndex,
    setActiveIndex,
  ] = useState(2);

  const [
    mystery,
    setMystery,
  ] =
    useState<MysteryWarrior>({
      key: "mystery",
      name:
        "Unclaimed Warrior",
      href: "/players",
      rank: null,
    });

  useEffect(() => {
    let cancelled = false;

    async function loadMystery() {
      try {
        const response =
          await fetch(
            "/api/lobby/leaderboard?lane=rm&offset=0&limit=128",
            {
              cache:
                "no-store",
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          (await response.json()) as {
            entries?: Array<{
              key?: string;
              name?: string;
              href?: string;
              rank?: number;
              claimed?: boolean;
              totalMatches?: number;
            }>;
          };

        const candidates =
          (
            payload.entries ??
            []
          ).filter(
            (entry) =>
              entry.claimed ===
                false &&
              Boolean(
                entry.name,
              ) &&
              (
                entry.totalMatches ??
                0
              ) > 0,
          );

        if (
          cancelled ||
          candidates.length ===
            0
        ) {
          return;
        }

        let selected =
          candidates[0];

        const storedKey =
          window.sessionStorage.getItem(
            MYSTERY_STORAGE_KEY,
          );

        const storedMatch =
          storedKey
            ? candidates.find(
                (entry) =>
                  entry.key ===
                  storedKey,
              )
            : null;

        if (storedMatch) {
          selected =
            storedMatch;
        } else {
          selected =
            candidates[
              Math.floor(
                Math.random() *
                  candidates.length,
              )
            ];

          if (selected.key) {
            window.sessionStorage.setItem(
              MYSTERY_STORAGE_KEY,
              selected.key,
            );
          }
        }

        if (
          cancelled ||
          !selected.name
        ) {
          return;
        }

        setMystery({
          key:
            selected.key ??
            `mystery:${selected.name}`,
          name:
            selected.name,
          href:
            selected.href ??
            `/players/by-name/${encodeURIComponent(
              selected.name,
            )}`,
          rank:
            selected.rank ??
            null,
        });
      } catch {
        /*
         * Silent fallback:
         * the symbolic silhouette
         * still renders.
         */
      }
    }

    void loadMystery();

    return () => {
      cancelled = true;
    };
  }, []);

  const warriors =
    useMemo<BountyWarrior[]>(
      () => [
        ...claimedWarriors,
        {
          id: "mystery",
          name:
            "Unclaimed Warrior",
          aliases: [],
          href:
            mystery.href,
          imageUrl:
            avatarCardUrlForName(
              mystery.name,
            ),
          mystery: true,
          rank:
            mystery.rank,
          mission:
            NEXT_MISSIONS.mystery,
        },
      ],
      [
        claimedWarriors,
        mystery,
      ],
    );

  const activeWarrior =
    warriors[activeIndex];

  const history =
    useMemo(
      () =>
        claimedHistory(
          board,
          activeWarrior,
        ),
      [
        activeWarrior,
        board,
      ],
    );

  const lifetimeValue =
    useMemo(
      () =>
        historyValue(
          history,
        ),
      [history],
    );

  const move =
    useCallback(
      (
        direction:
          | -1
          | 1,
      ) => {
        setActiveIndex(
          (current) =>
            (
              current +
              direction +
              warriors.length
            ) %
            warriors.length,
        );
      },
      [warriors.length],
    );

  return (
    <section className="relative mt-10 overflow-hidden rounded-[3rem] border border-amber-100/20 bg-[radial-gradient(circle_at_50%_-20%,rgba(251,191,36,0.16),transparent_34%),linear-gradient(180deg,#0b0c12_0%,#070911_48%,#050710_100%)] shadow-[0_48px_170px_rgba(0,0,0,0.58),0_0_100px_rgba(251,191,36,0.055)]">
      <AnimatePresence
        mode="wait"
      >
        <motion.div
          key={
            activeWarrior.id
          }
          initial={{
            opacity: 0,
          }}
          animate={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            duration: 0.55,
          }}
          className={`pointer-events-none absolute inset-x-0 top-0 h-[38rem] bg-gradient-to-b ${ambientClass(
            activeWarrior.id,
          )}`}
        />
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/75 to-transparent" />

      <div className="relative z-10 px-4 pb-8 pt-10 sm:px-7 lg:px-10 lg:pb-10">
        <header className="mx-auto max-w-4xl text-center">
          <div className="text-[10px] font-black uppercase tracking-[0.52em] text-amber-100/65">
            The Hall of
            Bounties
          </div>

        </header>

        {/* ===================================================
            BUTTERY 5-POSITION AVATAR STAGE
            =================================================== */}

        <div className="relative mx-auto mt-8 h-[21rem] max-w-[88rem] overflow-hidden sm:h-[25rem] lg:h-[29rem]">
          <button
            type="button"
            aria-label="Previous bounty warrior"
            onClick={() =>
              move(-1)
            }
            className="group absolute inset-y-0 left-0 z-10 w-1/2 cursor-w-resize"
          >
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl font-light text-white/0 transition duration-300 group-hover:text-amber-100/28 sm:left-7">
              ‹
            </span>
          </button>

          <button
            type="button"
            aria-label="Next bounty warrior"
            onClick={() =>
              move(1)
            }
            className="group absolute inset-y-0 right-0 z-10 w-1/2 cursor-e-resize"
          >
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-4xl font-light text-white/0 transition duration-300 group-hover:text-amber-100/28 sm:right-7">
              ›
            </span>
          </button>

          {warriors.map(
            (
              warrior,
              index,
            ) => {
              const offset =
                wrappedOffset(
                  index,
                  activeIndex,
                  warriors.length,
                );

              const active =
                offset === 0;

              const position =
                positionStyle(
                  offset,
                );

              return (
                <motion.button
                  key={
                    warrior.id
                  }
                  type="button"
                  onClick={() =>
                    setActiveIndex(
                      index,
                    )
                  }
                  aria-label={`Spotlight ${warrior.name}`}
                  aria-current={
                    active
                      ? "true"
                      : undefined
                  }
                  initial={
                    false
                  }
                  animate={{
                    left:
                      position.left,
                    x: "-50%",
                    y:
                      position.y,
                    scale:
                      position.scale,
                    opacity:
                      position.opacity,
                    filter:
                      position.filter,
                  }}
                  transition={
                    SPRING
                  }
                  className={`absolute top-1/2 z-20 w-32 cursor-pointer outline-none sm:w-44 lg:w-56 ${
                    active
                      ? "z-30"
                      : ""
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
                      src={
                        warrior.imageUrl
                      }
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
                    animate={{
                      opacity:
                        active
                          ? 1
                          : 0.58,
                      y:
                        active
                          ? 0
                          : -2,
                    }}
                    transition={{
                      duration:
                        0.35,
                    }}
                    className="mt-4 text-center"
                  >
                    <div
                      className={`font-semibold text-white ${
                        active
                          ? "text-xl sm:text-2xl"
                          : "text-sm sm:text-base"
                      }`}
                    >
                      {
                        warrior.name
                      }
                    </div>

                    {active &&
                    warrior.mystery ? (
                      <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.28em] text-amber-100/55">
                        Your place
                        is waiting
                      </div>
                    ) : null}
                  </motion.div>
                </motion.button>
              );
            },
          )}
        </div>

        {/* ===================================================
            ACTIVE WARRIOR DOSSIER
            =================================================== */}

        <AnimatePresence
          mode="wait"
        >
          <motion.div
            key={
              activeWarrior.id
            }
            initial={{
              opacity: 0,
              y: 18,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: -12,
            }}
            transition={{
              duration: 0.38,
              ease: [
                0.22,
                1,
                0.36,
                1,
              ],
            }}
            className="mx-auto max-w-6xl"
          >
            <div className="text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.4em] text-amber-100/50">
                Warrior in the
                Spotlight
              </div>

              <Link
                href={
                  activeWarrior.href
                }
                className="mt-2 inline-block font-serif text-4xl text-white transition hover:text-amber-100 sm:text-5xl"
              >
                {
                  activeWarrior.name
                }
              </Link>

              {activeWarrior.mystery &&
              mystery.name !==
                "Unclaimed Warrior" ? (
                <div className="mt-2 text-xs text-slate-600">
                  An unclaimed
                  warrior from the
                  battlefield stands
                  in shadow.
                </div>
              ) : null}
            </div>

            <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
              <div className="rounded-[1.35rem] border border-white/9 bg-black/28 p-5 text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">
                  Total Bounties
                  Claimed
                </div>

                <div className="mt-2 text-3xl font-semibold text-white">
                  {
                    history.length
                  }
                </div>
              </div>

              <div className="rounded-[1.35rem] border border-amber-100/10 bg-amber-300/[0.035] p-5 text-center">
                <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">
                  Lifetime
                  Bounties
                  Claimed
                </div>

                <div className="mt-2 text-2xl font-semibold text-amber-100 sm:text-3xl">
                  {lifetimeValue.toLocaleString()}{" "}
                  WOLO
                </div>
              </div>
            </div>

            {/* =================================================
                NEXT BOUNTY + PERSONAL CHRONICLE
                ================================================= */}

            <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <section className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] p-6 opacity-80 sm:p-7">
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0px,transparent_14px,rgba(255,255,255,0.012)_14px,rgba(255,255,255,0.012)_15px)]" />

                <div className="relative flex items-center justify-between gap-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.34em] text-slate-500">
                    Next Bounty
                  </div>

                  <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    🔒 Locked
                  </div>
                </div>

                <h2 className="relative mt-5 font-serif text-3xl text-slate-200 sm:text-4xl">
                  {
                    activeWarrior
                      .mission
                      .title
                  }
                </h2>

                <p className="relative mt-4 text-sm leading-7 text-slate-500">
                  {
                    activeWarrior
                      .mission
                      .description
                  }
                </p>

                <div className="relative mt-6 rounded-2xl border border-white/7 bg-black/20 p-4">
                  <div className="text-[9px] font-bold uppercase tracking-[0.23em] text-slate-600">
                    Reward
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-400">
                    {
                      activeWarrior
                        .mission
                        .reward
                    }
                  </div>
                </div>

                <div className="relative mt-5 text-[10px] leading-5 text-slate-600">
                  Preview mission.
                  Reward remains
                  locked until the
                  authoritative bounty
                  and settlement rails
                  prove completion.
                </div>
              </section>

              <section className="rounded-[2rem] border border-amber-100/10 bg-black/24 p-5 sm:p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.34em] text-amber-100/50">
                      The Bounty
                      Chronicle
                    </div>

                    <h2 className="mt-2 font-serif text-3xl text-white">
                      {activeWarrior.mystery
                        ? "The Chronicle Has Not Begun"
                        : `${activeWarrior.name}'s Claimed Bounties`}
                    </h2>
                  </div>

                  {!activeWarrior.mystery ? (
                    <div className="shrink-0 text-xs text-slate-600">
                      Newest ↑
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 max-h-[24rem] space-y-3 overflow-y-auto pr-2 [scrollbar-color:rgba(251,191,36,0.28)_transparent] [scrollbar-width:thin]">
                  {history.length ? (
                    history.map(
                      (
                        entry,
                        index,
                      ) => (
                        <article
                          key={
                            entry.key
                          }
                          className="relative rounded-2xl border border-white/8 bg-white/[0.028] p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-100/55">
                              {index ===
                              history.length -
                                1
                                ? "First Claimed Bounty"
                                : "Claimed Bounty"}
                            </div>

                            {entry.amountWolo !==
                            null ? (
                              <div className="text-sm font-bold text-amber-100">
                                {entry.amountWolo.toLocaleString()}{" "}
                                WOLO
                              </div>
                            ) : null}
                          </div>

                          <p className="mt-3 text-sm leading-6 text-slate-300">
                            {
                              entry.memo
                            }
                          </p>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[10px] text-slate-600">
                            <time>
                              {new Date(
                                entry.occurredAt,
                              ).toLocaleDateString(
                                undefined,
                                {
                                  year:
                                    "numeric",
                                  month:
                                    "short",
                                  day:
                                    "numeric",
                                },
                              )}
                            </time>

                            {entry.txHash ? (
                              <span className="text-emerald-200/60">
                                Paid ✓
                              </span>
                            ) : (
                              <span>
                                Recorded
                              </span>
                            )}
                          </div>
                        </article>
                      ),
                    )
                  ) : (
                    <div className="flex min-h-[15rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/8 bg-black/15 px-6 text-center">
                      <div className="text-4xl text-white/12">
                        ◇
                      </div>

                      <div className="mt-4 text-sm font-semibold text-slate-400">
                        No bounty has
                        yet been
                        claimed.
                      </div>

                      <div className="mt-2 max-w-sm text-xs leading-6 text-slate-600">
                        The Chronicle
                        begins with
                        the first
                        deed.
                      </div>
                    </div>
                  )}
                </div>

                {history.length >
                1 ? (
                  <div className="mt-3 text-center text-[9px] font-bold uppercase tracking-[0.24em] text-slate-700">
                    Scroll down to
                    the first bounty
                    ever claimed
                  </div>
                ) : null}
              </section>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
