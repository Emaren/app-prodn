---
id: "aoe2war.app-prodn.docs-kingdom-knowledge-router"
title: "Kingdom Knowledge Router"
type: "explanation"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn"]
audience: ["developers","operators","ai-agents"]
source_of_truth: "git"
authority: "architecture-explanation"
reviewed_at: "2026-08-20"
review_interval_days: 60
sensitivity: "internal"
---

# Kingdom Knowledge Router

The Kingdom Knowledge Router (KKR) is the shared read-only knowledge plane for
AoE2WAR AI agents.

## Product contract

Every AoE2WAR house agent may use the same authorized public Kingdom knowledge:

- players, aliases, ratings, records and online state;
- current leaderboard;
- recent and historical public battles;
- rivalry and team-composition history;
- live games and watch state;
- tournaments and Wolomania;
- challenges and challenge history;
- champions, national champions, belts, trophies and artifacts;
- Clan directory;
- Forum / War Room;
- betting markets and War Chest;
- WOLO and indexed WoloChain state;
- public staking state;
- Kingdom Forge;
- Oracle;
- bounties;
- Round Chamber;
- requests and roadmap demand;
- marketplace configuration;
- public radio metadata;
- public page/surface map and relevant page text.

The router does not dump the entire kingdom into every model request. It scores
the user's question, selects the smallest relevant repository set, loads those
repositories in parallel, and places repository-specific truth rules beside the
evidence that needs them.

## Hall contract

Hall Scribe uses the same public Kingdom Knowledge Router as The AI Scribe,
Grimer and other house voices.

Hall Scribe then receives one additive context source:

- the current Hall roster and audience-filtered Hall history supplied by
  `lib/clanHallScribe.ts`.

Hall context never replaces or limits public Kingdom knowledge.

A Hall reply at `public` may read only public Hall history. A `users` reply may
read public + users history. A `clan` reply may read public + users + clan
history.

## Privacy

KKR V1 is the public Kingdom knowledge plane.

Viewer-private wallet, wager, claim, staking, session, direct-message and
Profile War Archive document context remains outside KKR and continues to be
gated by the owning private surface and `lib/aiPromptPolicy.ts`. Private War
Archive bytes are never promoted into the public Kingdom knowledge plane.

Shared Hall and public-lobby surfaces never gain private viewer context merely
because KKR exists.

## Truth model

Each repository carries its own interpretation rules. Examples:

- battle repositories preserve unresolved results;
- honors use current-holder fields for current custody;
- betting distinguishes market state from payment proof;
- WoloChain uses indexed/mainnet-visible transfer truth;
- staking is app-side WOLO staking, never validator staking;
- Oracle markets remain predictions until resolved;
- governance proposals remain proposals until adopted.

This keeps domain rules beside domain evidence rather than bloating the
universal AI prompt.

## Routing and latency

Repository selection is deterministic and local. It does not require an extra
LLM call.

Selected repositories load concurrently with a bounded per-repository timeout.
The model receives a compact repository catalog plus bounded JSON evidence from
the selected repositories.

This keeps ordinary conversation fast while allowing deep questions to reach
the appropriate live system.

## Observability

Admin-only route:

`/api/admin/ai-knowledge?q=<question>&source=<surface>`

returns:

- selected repository IDs;
- per-repository load status / latency / payload size;
- the bounded context preview that would be supplied to an agent.

This is a read-only inspector.

## Provider boundary

KKR is provider-independent. OpenAI-backed agents, future local models and
future agent runtimes consume the same application-owned knowledge context.

The provider prompt defines only the agent's stable baseline behavior.
AoE2WAR owns current facts, routing, privacy and domain truth.


## Production-shaped shadow parity

The local writable shadow intentionally clones only a bounded control-plane
slice. KKR therefore classifies public knowledge loaders into four parity
classes:

1. **Canonical production DB** — production reads canonical Prisma directly.
2. **Realtime public JSON/page fallback** — shadow reads the current public
   production surface because the underlying estate is intentionally not
   cloned.
3. **Environment-independent application knowledge** — static route maps and
   marketplace constants are identical in shadow and production and need no
   shadow branch.
4. **Hall-local additive context** — the current local Hall roster/history
   remains local to the shadow so staged Hall behavior can be tested without
   mutating production.

Current examples:

- honors: shadow `/api/trophies`; production Prisma trophy estate;
- clans: shadow current public `/clans`; production canonical Clan directory;
- lobby chat: public `/api/lobby/chat` in both environments;
- site pages: current public rendered page text;
- site map and marketplace: environment-independent application constants.

A missing explicit `isShadowMode()` branch is therefore not automatically a
parity defect. The loader's truth source must be classified first.


## Query-aware evidence shaping

Large public repositories are filtered and compacted **before** the fixed
repository character budget is applied.

For named-player questions, KKR ranks player-directory rows and battle rows
against the user's query and moves the strongest entity matches to the front of
the repository payload. Battle ranking gives the highest weight to actual
participant names rather than incidental mentions inside replay chat or other
nested metadata.

This keeps KKR's bounded context fast while preventing a relevant player deep
inside a large leaderboard or battle corpus from being lost to prefix
truncation.

Rivalry evidence is explicitly scoped. A bounded recent corpus may support a
positive observed matchup, but absence from that corpus must not be presented
as proof that no historical public matchup exists.


## Downstream evidence preservation

Query-aware shaping is only useful if the focused repository payload survives
the later AI prompt assembly.

The concierge therefore grants the KKR plane a fixed **28,000-character**
budget and keeps the effective assembled prompt at a minimum of **40,000
characters**. The older 65%-of-24K KKR allocation and 24K final prompt default
are not valid normal-path ceilings because they can discard an already focused
repository before the model sees it.

Emergency prompt compaction remains available above the 40K normal floor.


## Query normalization safety

Stop words are removed before singularization and transformed terms are checked
again afterwards. This prevents common words such as `has` from becoming noisy
pseudo-terms such as `ha` that match unrelated repository content.


## Deterministic pair evidence

When a battle question resolves to exactly two focused player terms, KKR derives
an explicit pair-evidence summary from actual replay participants before the
model call.

The summary records:

- number of participant co-occurrences in the bounded repository payload;
- whether each meeting was as teammates, opponents, or unresolved;
- replay result relationship where the public winner truth supports it;
- concrete battle IDs, maps, winner proof, and timestamps.

This prevents the model from having to discover a player relationship by
reading generic game JSON. Positive co-occurrence is explicit evidence and
forbids a `no public record` answer. Zero bounded co-occurrences still does not
prove historical absence.


## Targeted pair archive

Exactly-two-player rivalry questions do not depend on the large global battle
history corpus.

KKR first loads the two players' targeted public match feeds using the same
player-profile archive surface used by the site. It merges those feeds by
battle ID and deterministically classifies shared meetings as:

- `1v1` opponents;
- opponents in a team game;
- teammates in a team game;
- unresolved relationship where the public label is insufficient.

Results are interpreted relative to the queried player feed and then normalized
back to the ordered query pair. Duplicate meetings from both feeds collapse to
one battle.

This targeted archive is the primary evidence for `How has X done against Y?`
questions. The broader recent-battle and battle-history repositories remain
useful corroboration, but a timeout in those large repositories must not erase
a direct meeting already present on a player's public archive.


## Player-search identity isolation

The KKR `players` repository uses the same composite-aware search semantics as
the public leaderboard. Historical composite replay labels remain evidence, but
their individual components cannot pull an unrelated Steam identity into a
player-focused AI query. Pair questions retain both separately named players by
matching any focused player term.

## 2026-08-17 release boundary - exact-Steam pair authority

Targeted exact-Steam pair evidence uses replay-player snapshots only as indexed
candidate locators. Both exact Steam estates are resolved in one batched lookup,
shared game IDs are intersected before hydration, and the shared GameStats rows
are hydrated once and independently verified for each canonical player.
GameStats cleanup and exact participant matching remain authoritative.

The repository watchdog remains four seconds. A focused two-player rivalry
question may execute the authoritative `rivalries` repository alone, but only
when the message has explicit rivalry intent. Leaderboard, rank, rating, ELO,
profile, Steam, online, streak, form, current-name or alias wording preserves
normal semantic fanout. False negatives are intentionally preferred over false
positives because normal fanout is safe while an incorrect collapse could hide
requested evidence.

Historical/name-only fallback archives remain bounded. Zero evidence from a
bounded fallback is not permission to make an absolute historical absence claim.


## KKR V2 - Scribe knows the Kingdom

The public knowledge plane now treats several high-value live questions as
explicit evidence contracts rather than leaving them to generic repository
sampling.

### Traffic Observatory

`traffic` is a first-class KKR repository backed by `/api/traffic/public`.

The public feed is a completed-UTC-day series. KKR preserves the upstream
Traffic Observatory semantics and exposes the latest two completed UTC days,
recent completed days, and deterministic day-over-day deltas/multiples.

Traffic counts must never be relabeled as unique people, unique visitors, or
unique IP addresses unless the Traffic Observatory semantics explicitly prove
that identity grain.

The public Traffic API wraps each day's metrics under `point.values`; the KKR
normalizer consumes that canonical envelope directly while retaining a flat-row
fallback for compatibility.


### Online humans

The player repository now carries explicit human/profile distinctions and an
`onlinePlayers` lane. Canonical internal system identities are excluded from
human counts and from the production online-human list.

Questions such as "Who is online?" therefore receive the current names rather
than only an aggregate count.

In production-shaped shadow mode, online-name questions deliberately bypass the
bounded leaderboard feed and read the dedicated public presence endpoint
(`/api/user/online_users`) at request time. This avoids both the leaderboard's
tracked-player scope and stale shadow `lastSeen` timestamps.


### Latest public battle

Recent-battle evidence carries an explicit `latestPublicBattle` record before
query-focused evidence. "Who played in the last game?" no longer depends on
generic evidence ranking to preserve the newest battle.

### Live Marketplace

The Marketplace repository keeps its environment-independent configuration
knowledge, but its runtime loader now adds the canonical active,
display-enabled `marketplace_shops` estate. Public business counts and names
therefore come from current storefront truth, not an old static description.

Pending proposals and owner/admin controls remain outside the public KKR
payload.

### Prediction and conversation truth

The provider may make an evidence-informed prediction when the member clearly
asks for a prediction, forecast, guess, ranking, or opinion. The uncertainty
must be clear and the prediction must never be presented as recorded fact.

Hall Scribe must treat supplied Hall history as the literal evidence for its own
past conversational actions. It may not claim that it previously greeted,
said, promised, or did something unless the supplied Hall history shows that
action.
