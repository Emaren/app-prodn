/** Private Observatory projection. Never output raw paths, click text or metadata. */
export type SafeEvent = {
  id: number;
  type: "page_view" | "click";
  destination: string;
  label: string;
  at: string;
  session: string | null; // internal only; stripped before API output
};
export type EventInput = {
  id: number;
  type: string;
  path: string | null;
  label: string | null;
  metadata: unknown;
  createdAt: Date | string;
};
export type RankedCount = { label: string; count: number };
export type TrendCount = { period: string; events: number; visitors: number; repeatVisitors: number };
export type JourneyStats = {
  views: number;
  clicks: number;
  sessions: number;
  visitDays: number;
  returning: boolean | null;
  estimatedActiveSeconds: number | null;
  estimateConfidence: "Limited" | "Unknown";
  lastPath: string | null;
  previousPath: string | null;
  lastEventAt: string | null;
  truncated: boolean;
  eventsObserved: number;
};
const ALLOWED = new Set([
  "/", "/about", "/academy", "/ai", "/aoe2war-os", "/battle-archive",
  "/belts", "/bets", "/betting-mechanics", "/bounties", "/challenge",
  "/champions", "/chaosium", "/clans", "/download", "/forum", "/game-stats",
  "/general-inspections", "/hd-replay-engine", "/kingdom", "/kingdom-agents",
  "/kingdom-brain", "/kingdom-bettors", "/kingdom-forge", "/kingdom-index",
  "/kingdom-intelligence", "/kingdom-progress", "/kingdom-recovery",
  "/kingdom-sensors", "/kingdom-systems", "/kingdom-tests", "/kingdom-treasury",
  "/leaderboard", "/leagues", "/library", "/live-games", "/lobby",
  "/market", "/matchups", "/nations", "/national-champions", "/olympia",
  "/oracle", "/players", "/radio", "/realm", "/renaissance", "/replay-laboratory",
  "/replay-parser", "/requests", "/rivalries", "/roadmap", "/round-chamber",
  "/speed", "/staking", "/statistics", "/television-wolo", "/tournaments",
  "/traffic", "/users", "/war-engine", "/wargraph", "/watch", "/wolo",
  "/wolo-1", "/wolochain", "/wolo-machine", "/wolomania", "/workshop", "/zodiac"
]);
const PUBLIC_FAMILY = new Set([
  "bets","challenge","champions","clans","forum","game-stats","leagues",
  "leaderboard","market","matchups","oracle","players","staking",
  "tournaments","watch"
]);
const HIDDEN = "Protected / unclassified";
const MAX_GAP_SECONDS = 600;

export function safeDestination(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")
      || raw.length > 160 || /[?#%\\\x00-\x1f\x7f]/.test(raw)) return HIDDEN;
  const normalized = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;
  if (ALLOWED.has(normalized)) return normalized;
  const pieces = normalized.split("/").slice(1);
  if (pieces.length >= 2 && PUBLIC_FAMILY.has(pieces[0]) &&
      pieces.every((piece) => /^[A-Za-z0-9_-]{1,80}$/.test(piece))) {
    return "/" + pieces[0] + "/[detail]";
  }
  if (normalized.startsWith("/renaissance/") && pieces.length === 2 &&
      /^[a-z-]+$/.test(pieces[1])) return "/renaissance/[instrument]";
  return HIDDEN;
}
export function safeEvent(input: EventInput): SafeEvent | null {
  if (input.type !== "page_view" && input.type !== "click") return null;
  const time = new Date(input.createdAt);
  if (!Number.isFinite(time.getTime()) || !Number.isSafeInteger(input.id)) return null;
  const meta = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? input.metadata as Record<string, unknown> : {};
  const rawSession = meta.journeySessionId;
  const session = typeof rawSession === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(rawSession)
    ? rawSession : null;
  const destination = safeDestination(input.path);
  return {
    id: input.id, type: input.type, destination, at: time.toISOString(),
    label: input.type === "page_view" ? "Viewed page" :
      meta.targetTag === "button" ? "Button click" : "Link / control click",
    session,
  };
}
export function publicEvent(event: SafeEvent) {
  return { id: event.id, type: event.type, destination: event.destination,
           at: event.at, label: event.label };
}
function chronological(rows: SafeEvent[]) {
  return [...rows].sort((a,b) => a.at.localeCompare(b.at) || a.id-b.id);
}
function sameSession(left: SafeEvent, right: SafeEvent) {
  if (left.session && right.session) return left.session === right.session;
  if (left.session || right.session) return false;
  const gap = (Date.parse(right.at) - Date.parse(left.at))/1000;
  return gap >= 0 && gap <= 1800;
}
function identitySessions(rows: SafeEvent[]) {
  const result: SafeEvent[][] = [];
  for (const row of chronological(rows)) {
    const target = result.at(-1);
    if (target?.length && sameSession(target[target.length-1],row)) target.push(row);
    else result.push([row]);
  }
  return result;
}
export function summarizeUser(rows: SafeEvent[], truncated: boolean): JourneyStats {
  const sorted = chronological(rows);
  const pages = sorted.filter(r => r.type === "page_view");
  const days = new Set(sorted.map(r => r.at.slice(0,10)));
  const sessions = identitySessions(sorted);
  let seconds = 0, observableGaps = 0;
  for (const segment of sessions) {
    for (let i=1; i<segment.length; i++) {
      const gap = (Date.parse(segment[i].at)-Date.parse(segment[i-1].at))/1000;
      if (gap > 0 && gap <= MAX_GAP_SECONDS) { seconds += Math.floor(gap); observableGaps++; }
    }
  }
  const uniquePageVisits = pages.filter((r,i) => i === 0 || r.destination !== pages[i-1].destination);
  return {
    views: pages.length,
    clicks: sorted.filter(r => r.type === "click").length,
    sessions: sessions.length,
    visitDays: days.size,
    returning: truncated ? (days.size >= 2 ? true : null) : days.size >= 2,
    estimatedActiveSeconds: observableGaps ? seconds : null,
    estimateConfidence: observableGaps ? "Limited" : "Unknown",
    lastPath: pages.at(-1)?.destination ?? null,
    previousPath: uniquePageVisits.length>1 ? uniquePageVisits.at(-2)?.destination ?? null : null,
    lastEventAt: sorted.at(-1)?.at ?? null,
    eventsObserved: sorted.length,
    truncated
  };
}
export function aggregateCohort(users: Array<{ uid: string; events: SafeEvent[]; truncated: boolean }>, now: Date, days: 7|30) {
  const paths = new Map<string,number>(), transitions = new Map<string,number>();
  const daily = new Map<string,{events:number;visitors:Set<string>;returning:Set<string>}>();
  const weekly = new Map<string,{events:number;visitors:Set<string>;returning:Set<string>}>();
  let views=0, clicks=0, returning=0, activeSeconds=0, measured=0, cut=0;
  for (const person of users) {
    const stats=summarizeUser(person.events,person.truncated);
    views += stats.views; clicks += stats.clicks;
    if (stats.returning === true) returning++;
    if (stats.estimatedActiveSeconds !== null) {activeSeconds+=stats.estimatedActiveSeconds; measured++;}
    if (person.truncated) cut++;
    const daysSeen = new Set(person.events.map(e => e.at.slice(0,10)));
    const repeat = daysSeen.size > 1;
    for(const entry of person.events) {
      const key = entry.at.slice(0,10);
      if(!daily.has(key)) daily.set(key,{events:0,visitors:new Set(),returning:new Set()});
      const d=daily.get(key)!;d.events++;d.visitors.add(person.uid);
      if(repeat)d.returning.add(person.uid);
      const date=new Date(entry.at);
      const day=(date.getUTCDay()+6)%7;
      const week=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-day)).toISOString().slice(0,10);
      if(!weekly.has(week))weekly.set(week,{events:0,visitors:new Set(),returning:new Set()});
      const w=weekly.get(week)!;w.events++;w.visitors.add(person.uid);
      if(repeat)w.returning.add(person.uid);
      if(entry.type==="page_view" && entry.destination !== HIDDEN) paths.set(entry.destination,(paths.get(entry.destination)??0)+1);
    }
    for(const session of identitySessions(person.events)){
      const seq=session.filter(e => e.type==="page_view" && e.destination!==HIDDEN);
      for(let i=1;i<seq.length;i++){
        if(seq[i].destination===seq[i-1].destination)continue;
        const label=seq[i-1].destination+" → "+seq[i].destination;
        transitions.set(label,(transitions.get(label)??0)+1);
      }
    }
  }
  const top=(source:Map<string,number>)=>[...source.entries()]
    .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,8)
    .map(([label,count])=>({label,count}));
  const series=(source:Map<string,{events:number;visitors:Set<string>;returning:Set<string>}>)=>
    [...source.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([period,value])=>({period,events:value.events,visitors:value.visitors.size,
                                repeatVisitors:value.returning.size}));
  return {
    cohortUsers:users.length, sampleLimitPerUser:120, clippedUsers:cut,
    views,clicks,returningUsersObserved:returning,
    estimatedActiveSeconds:measured?activeSeconds:null, dwellUserSamples:measured,
    topDestinations:top(paths), transitions:top(transitions),
    daily:series(daily),weekly:series(weekly),
    intervalDays:days, generatedAt:now.toISOString(),
    scope:"PAGINATED_USER_COHORT_ONLY" as const,
    notes:["Not a site-wide total: only the current roster page and up to 120 events per account.",
           "Returning means activity on at least two UTC dates within the selected interval.",
           "Dwell is a capped event-gap estimate, never measured time on page.",
           "Historical scroll positions and paths were not persisted.",
           "Live presence is a different, ephemeral process-local authority."]
  };
}
