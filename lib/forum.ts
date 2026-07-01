import type { PrismaClient } from "@/lib/generated/prisma";

export const FORUM_REACTIONS = ["⚔️", "🔥", "🧠", "🏰", "🐑", "11"] as const;
export type ForumReaction = (typeof FORUM_REACTIONS)[number];

export const FORUM_CHANNELS = [
  {
    key: "wolo-chronicles",
    label: "Wolo Chronicles",
    shortLabel: "Chronicles",
    description: "Field notes from the long war: people, rituals, grudges, and glorious bad decisions.",
  },
  {
    key: "champion-corner",
    label: "Champion Corner",
    shortLabel: "Champions",
    description: "The throne, the challengers, the tape, and the price of wearing a crown in public.",
  },
  {
    key: "official-announcements",
    label: "Official Announcements",
    shortLabel: "Official",
    description: "House rules, launches, league notices, and dispatches that should survive tavern telephone.",
  },
  {
    key: "bounty-board",
    label: "Bounty Board",
    shortLabel: "Bounties",
    description: "Wanted matchups, open challenges, and unfinished business with a number attached.",
  },
  {
    key: "tournaments",
    label: "Tournaments",
    shortLabel: "Tournaments",
    description: "Brackets, formats, recaps, sign-ups, and the ancient art of finding a time everyone can play.",
  },
  {
    key: "strategy-builds",
    label: "Strategy & Build Orders",
    shortLabel: "Strategy",
    description: "Timings, build orders, counterplay, and honest autopsies of dishonest openings.",
  },
  {
    key: "replays-analysis",
    label: "Replays & Analysis",
    shortLabel: "Replays",
    description: "Post the evidence. The score tells a story; the idle town centre tells the truth.",
  },
  {
    key: "maps-civs",
    label: "Maps & Civs",
    shortLabel: "Maps & Civs",
    description: "Civilization identity, map arguments, balance talk, and the weekly Arena peace summit.",
  },
  {
    key: "new-players",
    label: "New Players",
    shortLabel: "New Players",
    description: "No gatekeeping. Ask the question now so your villagers can stop answering it with their lives.",
  },
  {
    key: "watcher-help",
    label: "Watcher Help",
    shortLabel: "Watcher Help",
    description: "Replay capture, parsing, uploads, and practical help when the watchtower goes dark.",
  },
  {
    key: "suggestions",
    label: "Suggestions",
    shortLabel: "Suggestions",
    description: "Product ideas with enough detail to become work instead of weather.",
  },
  {
    key: "off-topic-tavern",
    label: "Off-Topic Tavern",
    shortLabel: "Tavern",
    description: "Still our table, just fewer build orders. Shoes optional; sportsmanship is not.",
  },
] as const;

export type ForumChannelKey = (typeof FORUM_CHANNELS)[number]["key"];

export const FORUM_TABS = [
  { key: "war-room", label: "War Room", channels: [] },
  {
    key: "match-discussions",
    label: "Match Discussions",
    channels: ["champion-corner", "bounty-board", "tournaments", "replays-analysis"],
  },
  {
    key: "strategy-guides",
    label: "Strategy & Guides",
    channels: ["strategy-builds", "maps-civs", "new-players"],
  },
  {
    key: "replays-analysis",
    label: "Replays & Analysis",
    channels: ["replays-analysis", "watcher-help"],
  },
  {
    key: "general",
    label: "General",
    channels: ["wolo-chronicles", "official-announcements", "suggestions"],
  },
  { key: "off-topic", label: "Off-Topic", channels: ["off-topic-tavern"] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  channels: readonly ForumChannelKey[];
}>;

export type ForumTabKey = (typeof FORUM_TABS)[number]["key"];

type ForumSeedReply = {
  author: string;
  role: string;
  body: string;
};

type ForumSeed = {
  seedKey: string;
  slug: string;
  channel: ForumChannelKey;
  tag: string;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  authorRole: string;
  createdAt: string;
  pinned?: boolean;
  featured?: boolean;
  hot?: boolean;
  locked?: boolean;
  views: number;
  reactionBase: Partial<Record<ForumReaction, number>>;
  replies: ForumSeedReply[];
};

export const FORUM_SEED_THREADS: readonly ForumSeed[] = [
  {
    seedKey: "chronicles-001",
    slug: "wolo-chronicles-001-the-kingdom-has-no-pause-button",
    channel: "wolo-chronicles",
    tag: "Wolo Chronicles · I",
    title: "The Kingdom Has No Pause Button",
    excerpt:
      "AoE2 stops being a game somewhere between the first clean build and the thousandth time you hear a farm expire in real life.",
    body: `Every long-lived Age of Empires room eventually becomes more than a place to arrange games. It becomes weather. People drift in after work, old rivals remember one another's favourite lies, and a single “1v1?” can quietly rearrange an evening.

The Wolo Chronicles are for that part of the war: the habits, friendships, grudges, local legends, replay archaeology, and extremely confident decisions made with twelve idle villagers. These are not patch notes. They are the record of a civilization that still hears the town-centre bell in grocery-store checkout scanners.

Our first question is simple: when did AoE2 stop being a game you played and become a place you returned to? Bring a story. Perfect memory is not required; a suspiciously flattering version of events is traditional.`,
    author: "War Room Scribe",
    authorRole: "Keeper of the long memory",
    createdAt: "2026-07-01T17:05:00.000Z",
    pinned: true,
    featured: true,
    hot: true,
    views: 214,
    reactionBase: { "🔥": 18, "🏰": 27, "🐑": 11 },
    replies: [
      {
        author: "OldSchoolHD",
        role: "Still queues one more",
        body: "The first time a friend called to talk about life and we somehow ended up reviewing his woodline. That was probably the border crossing.",
      },
      {
        author: "CastleEnjoyer",
        role: "Municipal planning enthusiast",
        body: "I knew it was permanent when I started judging real hills by whether a castle foundation would fit.",
      },
      {
        author: "TheViperFan",
        role: "Long-table regular",
        body: "The farm-expiry sound has followed me into dreams. At this point the game is charging rent and I am afraid to ask how much.",
      },
    ],
  },
  {
    seedKey: "official-room-code",
    slug: "war-room-code-bring-receipts-respect-the-gg",
    channel: "official-announcements",
    tag: "House Dispatch",
    title: "The War Room Code: Bring Receipts. Respect the GG.",
    excerpt:
      "Argue hard, post the replay, and leave the person on the other side of the palisade with their dignity.",
    body: `The War Room has room for loud opinions. It does not have room for lazy cruelty. Critique the decision, the build, the map generation, or the deeply optimistic forward barracks. Do not turn a game argument into a character verdict.

If you are making a factual claim, bring the replay, timestamp, screenshot, or route. “Everybody knows” is not a source; it is usually three villagers in a trench coat.

The house rule is short: GG is offered, never extracted. New players get real answers. Veterans are allowed to be wrong in public. If a discussion gets hot, add evidence before volume.`,
    author: "AoE2WAR Steward",
    authorRole: "House voice",
    createdAt: "2026-07-01T15:30:00.000Z",
    pinned: true,
    featured: true,
    views: 187,
    reactionBase: { "⚔️": 14, "🧠": 31, "11": 9 },
    replies: [
      {
        author: "NoobQuestion",
        role: "Asks the useful thing",
        body: "The new-player line matters. A straight answer at the right time can save somebody fifty games of inventing the wrong lesson.",
      },
      {
        author: "ReplayOrItDidnt",
        role: "Clerk of evidence",
        body: "Motion to engrave “three villagers in a trench coat” above the reply box.",
      },
    ],
  },
  {
    seedKey: "champion-desk",
    slug: "champions-desk-what-the-throne-asks-of-a-challenger",
    channel: "champion-corner",
    tag: "Champion's Desk",
    title: "What the Throne Asks of a Challenger",
    excerpt:
      "A crown is not a profile ornament. It is an open invitation to arrive prepared, make the room care, and play the set.",
    body: `The World Championship tile says Sniper. The useful question is not whether the name looks good under a crown; it is what kind of challenger makes the crown mean more.

A proper challenge needs a player, a format, a reasonable window, and a reason the room should stop what it is doing to watch. “I could beat him” is tavern air. “Best of five, these maps, this week, here is my recent form” is a match trying to exist.

Use this thread to make the case. Name the matchup, name the stakes, and show enough work that the challenger is more than a notification.`,
    author: "Crown Office",
    authorRole: "Championship desk",
    createdAt: "2026-07-01T14:10:00.000Z",
    featured: true,
    views: 166,
    reactionBase: { "⚔️": 22, "🔥": 15, "🏰": 7 },
    replies: [
      {
        author: "ComebackKing",
        role: "Bounty-board regular",
        body: "A challenge should answer why this set, why now, and what changes if the challenger wins. Otherwise it is just a confident weather report.",
      },
      {
        author: "TeamBoom",
        role: "Format mechanic",
        body: "Give me one home map each, one neutral, and enough notice to make a poster. The room will do the rest.",
      },
    ],
  },
  {
    seedKey: "bounty-matchup",
    slug: "bounty-board-name-the-matchup-the-room-deserves",
    channel: "bounty-board",
    tag: "Open Bounty",
    title: "Name the Matchup the Room Deserves",
    excerpt:
      "Pitch a set worth clearing the evening for. Bonus points for history, clashing styles, or a grievance with excellent paperwork.",
    body: `The bounty board is open for matchmaking with a pulse. We want sets with a story: an old rivalry, a style collision, a rematch that has aged into folklore, or two players who keep talking around the obvious solution.

Post both names, the format, the best scheduling window you know, and one paragraph on why this is not just another ladder game with nicer lighting.

Do not promise another person's availability. Summon boldly; schedule like an adult.`,
    author: "Bounty Clerk",
    authorRole: "Keeps the red string organized",
    createdAt: "2026-07-01T12:40:00.000Z",
    featured: true,
    hot: true,
    views: 143,
    reactionBase: { "⚔️": 19, "🔥": 24 },
    replies: [
      {
        author: "MangudaiMaster",
        role: "Matchup romantic",
        body: "One aggressive player, one defender who treats walls as a personal philosophy, open map, best of five. I do not even need names yet.",
      },
      {
        author: "AoE2Caster",
        role: "Has already made the thumbnail",
        body: "History is good, but visible contrast is better. If the first minute explains the feud without narration, we have a show.",
      },
    ],
  },
  {
    seedKey: "strategy-scouts",
    slug: "the-21-pop-scout-build-for-people-who-forgot-house-two",
    channel: "strategy-builds",
    tag: "Build Order · Forgiving",
    title: "The 21-Pop Scout Build for People Who Forgot House #2",
    excerpt:
      "A practical Feudal line with recovery branches for the moment your perfect build meets your actual hands.",
    body: `The clean version is familiar: six on sheep, four to wood, lure the boar, add food, click Feudal with the economy already leaning toward stable production. The useful version begins when the second house is late and your villager distribution looks like a committee designed it.

If you are housed before the click, do not “make up” the lost time by floating resources and panicking faster. Finish the house, protect villager production, and decide whether the stable timing still buys information or damage. One late scout opening can become a clean range follow-up; it does not need to become three bad openings stacked together.

The real checkpoint is not population. It is purpose. Before the first scout crosses the map, know whether you are checking greed, forcing spears, denying a resource, or simply learning where the opponent lives.`,
    author: "StableHand",
    authorRole: "Build-order realist",
    createdAt: "2026-07-01T10:20:00.000Z",
    hot: true,
    views: 132,
    reactionBase: { "🧠": 17, "🐑": 28, "11": 12 },
    replies: [
      {
        author: "HouseAt20",
        role: "Recovering perfectionist",
        body: "“Do not panic faster” is the exact branch my build sheet was missing.",
      },
      {
        author: "SpearmanApologist",
        role: "Keeps one by the berries",
        body: "The purpose checkpoint is huge. A scout that sees the range and leaves has often done more work than one that dies trying to nibble a lumberjack.",
      },
      {
        author: "NoobQuestion",
        role: "Asks the useful thing",
        body: "Could we add a replay where the house is late and the recovery works? Clean examples are good; rescued examples teach me more.",
      },
    ],
  },
  {
    seedKey: "replay-clinic",
    slug: "replay-clinic-the-game-was-lost-before-the-score-noticed",
    channel: "replays-analysis",
    tag: "Replay Clinic",
    title: "The Game Was Lost Three Minutes Before the Score Noticed",
    excerpt:
      "A replay-review method for finding the first expensive decision, not merely the final dramatic one.",
    body: `Start the review before the army disappears. The cinematic disaster is often only the invoice.

Pause at each commitment: age-up, production building, extra town centre, forward position, tech switch. Ask what information was available, what the choice assumed, and what the economy could actually support. Then look three minutes ahead. If the game becomes impossible there, rewind one decision—not one fight.

Score is a useful smoke alarm, but it is not a fire investigator. The best replay note sounds like something you can do next game: “scout the second gold before adding the third range,” not “avoid losing twenty crossbows.”`,
    author: "ReplayOrItDidnt",
    authorRole: "Clinic host",
    createdAt: "2026-06-30T21:45:00.000Z",
    views: 118,
    reactionBase: { "🧠": 26, "⚔️": 6 },
    replies: [
      {
        author: "OldSchoolHD",
        role: "Replay archaeologist",
        body: "Reviewing commitments instead of battles changed everything for me. The army wipe is memorable; the unsupported second stable is actionable.",
      },
      {
        author: "IdleTC",
        role: "Pays the voluntary tax",
        body: "I would add one checkpoint: count production cycles you could not afford. Empty buildings are decisions too.",
      },
    ],
  },
  {
    seedKey: "arena-trust-exercise",
    slug: "arena-is-a-45-minute-trust-exercise",
    channel: "maps-civs",
    tag: "Map Philosophy",
    title: "Arena Is Not a Map. It Is a 45-Minute Trust Exercise.",
    excerpt:
      "You both begin behind stone walls and politely pretend nothing unreasonable is being constructed on the other side.",
    body: `Arena begins with a social contract: I will boom in a civilized manner, you will boom in a civilized manner, and neither of us will arrive with monks, siege, and a castle before the paperwork is complete.

Then somebody scouts the relics.

The map rewards planning because access is controlled, but it punishes plans that confuse safety with knowledge. Your walls stop units. They do not stop the opponent from having an idea. What is your earliest “the treaty is over” signal: the uptime, the monastery count, the forward villager, or the suspicious silence?`,
    author: "CastleEnjoyer",
    authorRole: "Wall-adjacent philosopher",
    createdAt: "2026-06-30T19:20:00.000Z",
    hot: true,
    views: 109,
    reactionBase: { "🏰": 32, "11": 21, "🔥": 8 },
    replies: [
      {
        author: "MonkMicro",
        role: "Treaty violator",
        body: "The first monastery is diplomacy. The third monastery is a declaration.",
      },
      {
        author: "OpenMapLobbyist",
        role: "Here under protest",
        body: "I came to disagree, but “walls stop units, not ideas” is annoyingly strong.",
      },
    ],
  },
  {
    seedKey: "castle-drop-discourse",
    slug: "castle-drops-masterpiece-or-medieval-eviction-notice",
    channel: "maps-civs",
    tag: "Hot Discussion",
    title: "Castle Drops: Strategic Masterpiece or Medieval Eviction Notice?",
    excerpt:
      "A serious inquiry into the least subtle 650-stone message one player can send another.",
    body: `The forward castle is strategy at full volume. It can deny resources, anchor pressure, erase space, and force the defender to solve several problems while a very large building explains the stakes.

It can also be 650 stone standing proudly next to nothing while your home economy files a missing-person report.

The difference is not courage. It is follow-up. What does the castle unlock, what does it deny, and what happens if the foundation is spotted early? Post your best castle drop or your most expensive piece of landscape architecture.`,
    author: "ForwardVill",
    authorRole: "Licensed medieval contractor",
    createdAt: "2026-06-30T16:05:00.000Z",
    hot: true,
    views: 101,
    reactionBase: { "🏰": 29, "🔥": 18, "11": 7 },
    replies: [
      {
        author: "TownBellEnjoyer",
        role: "Local zoning authority",
        body: "A castle on my gold is aggression. A castle three tiles outside my vision is urban renewal. Context matters.",
      },
      {
        author: "TeamBoom",
        role: "Prefers infrastructure",
        body: "The home-economy question is the whole thread. If the castle needs immediate value just to keep you alive, it is not pressure; it is a deadline.",
      },
    ],
  },
  {
    seedKey: "new-player-age-up",
    slug: "what-should-i-do-while-aging-up",
    channel: "new-players",
    tag: "New Player · Good Question",
    title: "What Should I Be Doing While Aging Up?",
    excerpt:
      "The age-up bar is not a commercial break. Here is the short list that turns waiting into a plan.",
    body: `First: keep making villagers if your town centre allows it. Second: move the builders you will need for your opening—usually wood for production, food for units, and the resource your first military choice actually costs.

Third: scout with a question. Where are the vulnerable resources? Is a barracks appearing? Are walls closing? Random movement reveals terrain; purposeful movement reveals a plan.

Finally, place the next two actions in order. “Build stable, make scout” is better than arriving in Feudal and opening the technology tree like a restaurant menu.`,
    author: "NoobQuestion",
    authorRole: "Asked so everyone benefits",
    createdAt: "2026-06-30T13:30:00.000Z",
    views: 94,
    reactionBase: { "🧠": 19, "🐑": 16 },
    replies: [
      {
        author: "StableHand",
        role: "Build-order realist",
        body: "Add houses before you need them. Feudal openings consume attention, and population space is cheaper than discovering 25/25 during the first fight.",
      },
      {
        author: "MapReader",
        role: "Scouts with questions",
        body: "I like choosing one scouting question per lap: where is gold, where is wood, where is the army. It stopped my scout from just touring.",
      },
    ],
  },
  {
    seedKey: "ugliest-victory",
    slug: "post-your-ugliest-victory-elegance-optional",
    channel: "replays-analysis",
    tag: "Community Confessional",
    title: "Post Your Ugliest Victory. Elegance Optional.",
    excerpt:
      "The build collapsed, the map was on fire, nobody had enough gold—and somehow the victory screen still arrived.",
    body: `Clean wins teach the plan. Ugly wins reveal the player.

Post the replay where the opening failed, the economy became folk art, and the only remaining strategy was to keep presenting the opponent with new inconveniences. We are looking for accidental tech switches, emergency walls, market abuse, villagers with military careers, and siege that survived entirely through clerical error.

No false modesty. If you held with six villagers and a dream, document the dream.`,
    author: "ComebackKing",
    authorRole: "Curator of impossible paperwork",
    createdAt: "2026-06-30T10:10:00.000Z",
    views: 86,
    reactionBase: { "🔥": 23, "⚔️": 12, "11": 18 },
    replies: [
      {
        author: "MarketEnjoyer",
        role: "Buys food at criminal rates",
        body: "Won after selling stone so aggressively that the market should have contacted a responsible adult.",
      },
      {
        author: "OneMango",
        role: "Still technically alive",
        body: "My winning army was two monks, one mangonel, and the opponent's certainty that I had more than two monks and one mangonel.",
      },
    ],
  },
  {
    seedKey: "watcher-four-checks",
    slug: "replay-missing-four-checks-before-panic",
    channel: "watcher-help",
    tag: "Watcher Help",
    title: "Replay Missing? Four Checks Before We Blame the Trebuchets.",
    excerpt:
      "A calm field checklist for capture, finalization, upload, and the moment a replay becomes visible.",
    body: `Check the source folder first: did the game actually write a replay, and is the file still changing? A live or half-written artifact is not ready for judgment.

Check the watcher state next. Confirm it is pointed at the HD replay location you are using, not the location you used six months and one reinstall ago. Then check whether the game finalized normally; disconnects and abrupt exits can produce different evidence.

Finally, check the upload or parse surface for the filename and time. If it still has not arrived, report the filename, approximate finish time, and what the watcher showed. “It is broken” creates a mystery. Three concrete facts create a trail.`,
    author: "Watchtower Keeper",
    authorRole: "Replay support",
    createdAt: "2026-06-29T22:15:00.000Z",
    views: 75,
    reactionBase: { "🧠": 14, "🏰": 5 },
    replies: [
      {
        author: "BugHunter",
        role: "Brings timestamps",
        body: "Filename plus finish time is the magic pair. It lets us separate capture trouble from upload trouble almost immediately.",
      },
      {
        author: "AltTabKnight",
        role: "Has reinstalled twice",
        body: "Please bold the old replay-directory trap. My watcher was faithfully guarding an empty village for a week.",
      },
    ],
  },
  {
    seedKey: "tavern-sounds",
    slug: "which-aoe2-sound-has-colonized-your-brain",
    channel: "off-topic-tavern",
    tag: "Tavern Question",
    title: "Which AoE2 Sound Has Colonized Your Brain?",
    excerpt:
      "The farm expires. The monk converts. Somewhere, without warning, your internal town bell rings.",
    body: `This is a scientific inventory of sounds that escaped the game and now live in ordinary life.

Does a microwave finish and make you think a technology completed? Does a construction site trigger the castle foundation sound? Have you ever heard a sheep and immediately counted to four?

Name the sound, name the real-world trigger, and tell us how much damage has been done.`,
    author: "OffTopicOnager",
    authorRole: "Tavern table seven",
    createdAt: "2026-06-29T18:00:00.000Z",
    views: 63,
    reactionBase: { "🐑": 34, "11": 26 },
    replies: [
      {
        author: "TownBellEnjoyer",
        role: "Appropriately named",
        body: "A bicycle bell behind me. Immediate full-economy panic.",
      },
      {
        author: "WololoAtWork",
        role: "Human resources concern",
        body: "My colleague changed teams and I heard the conversion sound in perfect clarity. I did not say it aloud. This time.",
      },
    ],
  },
] as const;

export type ForumPostView = {
  id: number | null;
  body: string;
  createdAt: string;
  author: {
    uid: string | null;
    displayName: string;
    role: string;
  };
};

export type ForumThreadView = {
  id: number | null;
  seedKey: string | null;
  slug: string;
  channel: ForumChannelKey;
  tag: string;
  title: string;
  excerpt: string;
  body: string;
  isPinned: boolean;
  isFeatured: boolean;
  isHot: boolean;
  isLocked: boolean;
  source: "chronicle" | "community";
  viewCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  bookmarked: boolean;
  author: {
    uid: string | null;
    displayName: string;
    role: string;
  };
  reactions: Array<{
    emoji: ForumReaction;
    count: number;
    viewerReacted: boolean;
  }>;
  posts: ForumPostView[];
};

export type ForumSnapshot = {
  ledgerAvailable: boolean;
  viewer: {
    authenticated: boolean;
    uid: string | null;
    displayName: string | null;
  };
  channels: Array<(typeof FORUM_CHANNELS)[number] & { count: number }>;
  threads: ForumThreadView[];
};

const CHANNEL_KEYS = new Set<string>(FORUM_CHANNELS.map((channel) => channel.key));
const REACTION_SET = new Set<string>(FORUM_REACTIONS);
const SEED_BY_KEY = new Map(FORUM_SEED_THREADS.map((thread) => [thread.seedKey, thread]));

export function isForumChannel(value: unknown): value is ForumChannelKey {
  return typeof value === "string" && CHANNEL_KEYS.has(value);
}

export function isForumReaction(value: unknown): value is ForumReaction {
  return typeof value === "string" && REACTION_SET.has(value);
}

export function normalizeForumTitle(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

export function normalizeForumExcerpt(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 320);
}

export function normalizeForumBody(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 12_000);
}

export function buildForumSlug(title: string) {
  const stem =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "war-room-dispatch";
  return `${stem}-${Date.now().toString(36)}`;
}

function seedReactionRows(seed: ForumSeed | undefined) {
  return FORUM_REACTIONS.map((emoji) => ({
    emoji,
    count: seed?.reactionBase[emoji] ?? 0,
    viewerReacted: false,
  }));
}

function fallbackThread(seed: ForumSeed): ForumThreadView {
  return {
    id: null,
    seedKey: seed.seedKey,
    slug: seed.slug,
    channel: seed.channel,
    tag: seed.tag,
    title: seed.title,
    excerpt: seed.excerpt,
    body: seed.body,
    isPinned: Boolean(seed.pinned),
    isFeatured: Boolean(seed.featured),
    isHot: Boolean(seed.hot),
    isLocked: Boolean(seed.locked),
    source: "chronicle",
    viewCount: seed.views,
    replyCount: seed.replies.length,
    createdAt: seed.createdAt,
    updatedAt: seed.createdAt,
    bookmarked: false,
    author: {
      uid: null,
      displayName: seed.author,
      role: seed.authorRole,
    },
    reactions: seedReactionRows(seed),
    posts: seed.replies.map((reply, index) => ({
      id: null,
      body: reply.body,
      createdAt: new Date(
        new Date(seed.createdAt).getTime() + (index + 1) * 37 * 60 * 1000
      ).toISOString(),
      author: {
        uid: null,
        displayName: reply.author,
        role: reply.role,
      },
    })),
  };
}

function channelsWithCounts(threads: ForumThreadView[]) {
  return FORUM_CHANNELS.map((channel) => ({
    ...channel,
    count: threads.filter((thread) => thread.channel === channel.key).length,
  }));
}

export function buildForumFallbackSnapshot(): ForumSnapshot {
  const threads = FORUM_SEED_THREADS.map(fallbackThread);
  return {
    ledgerAvailable: false,
    viewer: {
      authenticated: false,
      uid: null,
      displayName: null,
    },
    channels: channelsWithCounts(threads),
    threads,
  };
}

export async function ensureForumSeeds(prisma: PrismaClient) {
  const existingRows = await prisma.forumThread.findMany({
    where: { seedKey: { not: null } },
    select: { seedKey: true },
  });
  const existing = new Set(existingRows.map((row) => row.seedKey).filter(Boolean));
  const missing = FORUM_SEED_THREADS.filter((seed) => !existing.has(seed.seedKey));
  if (missing.length === 0) return;

  await prisma.$transaction(
    missing.map((seed) =>
      prisma.forumThread.create({
        data: {
          slug: seed.slug,
          seedKey: seed.seedKey,
          channel: seed.channel,
          tag: seed.tag,
          title: seed.title,
          excerpt: seed.excerpt,
          body: seed.body,
          authorLabel: seed.author,
          authorRole: seed.authorRole,
          isPinned: Boolean(seed.pinned),
          isFeatured: Boolean(seed.featured),
          isHot: Boolean(seed.hot),
          isLocked: Boolean(seed.locked),
          viewCount: seed.views,
          createdAt: new Date(seed.createdAt),
          updatedAt: new Date(seed.createdAt),
          posts: {
            create: seed.replies.map((reply, index) => ({
              seedKey: `${seed.seedKey}-reply-${index + 1}`,
              authorLabel: reply.author,
              authorRole: reply.role,
              body: reply.body,
              createdAt: new Date(
                new Date(seed.createdAt).getTime() + (index + 1) * 37 * 60 * 1000
              ),
              updatedAt: new Date(
                new Date(seed.createdAt).getTime() + (index + 1) * 37 * 60 * 1000
              ),
            })),
          },
        },
      })
    )
  );
}

function displayNameForUser(
  user: { inGameName: string | null; steamPersonaName: string | null } | null,
  fallback: string | null
) {
  return user?.inGameName || user?.steamPersonaName || fallback || "Unknown Scout";
}

export async function loadForumSnapshot(
  prisma: PrismaClient,
  viewerUid: string | null
): Promise<ForumSnapshot> {
  await ensureForumSeeds(prisma);

  const viewer = viewerUid
    ? await prisma.user.findUnique({
        where: { uid: viewerUid },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      })
    : null;

  const rows = await prisma.forumThread.findMany({
    include: {
      author: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      posts: {
        include: {
          author: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      bookmarks: {
        select: { userId: true },
      },
      reactions: {
        select: {
          userId: true,
          emoji: true,
        },
      },
    },
    orderBy: [
      { isPinned: "desc" },
      { isFeatured: "desc" },
      { updatedAt: "desc" },
      { id: "desc" },
    ],
    take: 120,
  });

  const threads: ForumThreadView[] = rows.map((row) => {
    const seed = row.seedKey ? SEED_BY_KEY.get(row.seedKey) : undefined;
    const reactions = FORUM_REACTIONS.map((emoji) => {
      const matching = row.reactions.filter((reaction) => reaction.emoji === emoji);
      return {
        emoji,
        count: (seed?.reactionBase[emoji] ?? 0) + matching.length,
        viewerReacted: Boolean(
          viewer && matching.some((reaction) => reaction.userId === viewer.id)
        ),
      };
    });

    return {
      id: row.id,
      seedKey: row.seedKey,
      slug: row.slug,
      channel: isForumChannel(row.channel) ? row.channel : "wolo-chronicles",
      tag: row.tag,
      title: row.title,
      excerpt: row.excerpt,
      body: row.body,
      isPinned: row.isPinned,
      isFeatured: row.isFeatured,
      isHot: row.isHot,
      isLocked: row.isLocked,
      source: row.seedKey ? "chronicle" : "community",
      viewCount: row.viewCount,
      replyCount: row.posts.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      bookmarked: Boolean(
        viewer && row.bookmarks.some((bookmark) => bookmark.userId === viewer.id)
      ),
      author: {
        uid: row.author?.uid ?? null,
        displayName: displayNameForUser(row.author, row.authorLabel),
        role: row.authorRole || (row.seedKey ? "War Room regular" : "AoE2WAR citizen"),
      },
      reactions,
      posts: row.posts.map((post) => ({
        id: post.id,
        body: post.body,
        createdAt: post.createdAt.toISOString(),
        author: {
          uid: post.author?.uid ?? null,
          displayName: displayNameForUser(post.author, post.authorLabel),
          role: post.authorRole || (post.seedKey ? "War Room regular" : "AoE2WAR citizen"),
        },
      })),
    };
  });

  return {
    ledgerAvailable: true,
    viewer: {
      authenticated: Boolean(viewer),
      uid: viewer?.uid ?? null,
      displayName: viewer ? displayNameForUser(viewer, null) : null,
    },
    channels: channelsWithCounts(threads),
    threads,
  };
}
